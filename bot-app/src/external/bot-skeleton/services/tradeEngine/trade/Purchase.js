import { LogTypes } from '../../../constants/messages';
import { mobileTradeLog } from '../../../utils/mobile-trade-debug';
import { api_base } from '../../api/api-base';
import { contractStatus, error as logError, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from '../utils/helpers';
import { purchaseSuccessful } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';

let delayIndex = 0;
let purchase_reference;

// CORRECCIÓN (móvil): antes, si la API nunca respondía (típico en
// Android/iOS cuando el sistema operativo "mata" el WebSocket en segundo
// plano sin disparar 'close' — el socket queda "zombie", reportando OPEN
// aunque ya no hay nadie al otro lado), la promesa de purchase() podía
// quedar pendiente para siempre: el run-panel se quedaba bloqueado en
// "Comprando" indefinidamente. En PC esto casi no pasa porque el WebSocket
// rara vez se cae mientras la pestaña está activa y en primer plano.
//
// La solución NO es simular una compra que el servidor nunca confirmó
// (eso sería mentir sobre una operación real/demo contra la API de Deriv).
// En su lugar, si no llega respuesta en PURCHASE_FIRST_CHECK_MS:
//   1) Si ya hubo una reconexión real mientras se esperaba (api_base
//      cambió de instancia), no se sabe si el servidor alcanzó a procesar
//      el buy original -> NO se reintenta (evita una compra duplicada) y
//      se informa con claridad que se perdió la conexión.
//   2) Si no hubo reconexión, se verifica con un ping real si el socket
//      sigue vivo. Si no responde, se fuerza una reconexión y se informa
//      el fallo (sin reintentar el buy, por la misma razón que el punto 1).
//   3) Si el ping sí responde, el servidor solo está tardando: se da un
//      margen adicional, con un límite máximo absoluto
//      (PURCHASE_HARD_LIMIT_MS) para nunca dejar la UI cargando para
//      siempre.
// En ningún caso se reenvía automáticamente la compra: el único reintento
// que existe es el ya existente de doUntilDone/recoverFromError para
// errores "ignorables" que el SERVIDOR sí respondió (RateLimit, etc.), que
// es un mecanismo distinto y no toca el socket.
const PURCHASE_FIRST_CHECK_MS = 6000;
const PURCHASE_LIVENESS_TIMEOUT_MS = 4000;
const PURCHASE_HARD_LIMIT_MS = 15000;

export default Engine =>
    class Purchase extends Engine {
        purchase(contract_type) {
            // Prevent calling purchase twice
            if (this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            const onSuccess = response => {
                // Don't unnecessarily send a forget request for a purchased contract.
                const { buy } = response;

                contractStatus({
                    id: 'contract.purchase_received',
                    data: buy.transaction_id,
                    buy,
                });

                this.contractId = buy.contract_id;
                this.store.dispatch(purchaseSuccessful());

                if (this.is_proposal_subscription_required) {
                    this.renewProposalsOnPurchase();
                }

                delayIndex = 0;
                log(LogTypes.PURCHASE, { transaction_id: buy.transaction_id });
                info({
                    accountID: this.accountInfo.loginid,
                    totalRuns: this.updateAndReturnTotalRuns(),
                    transaction_ids: { buy: buy.transaction_id },
                    contract_type,
                    buy_price: buy.buy_price,
                });
            };

            // Vigila una compra en curso sin inventar un resultado. Devuelve
            // una promesa que:
            //  - se resuelve con la respuesta real si el servidor confirma,
            //  - se rechaza con el error real si el servidor lo rechaza,
            //  - se rechaza con un error "ConnectionLost"/"ResponseTimeout"
            //    si nunca hay respuesta, para que el run-panel se desbloquee
            //    y el manejo de errores existente del bot (reintentos,
            //    reinicio, parada) siga funcionando igual que con cualquier
            //    otro error — nunca queda "cargando" para siempre.
            const watchPurchase = (action_promise, label) =>
                new Promise((resolve, reject) => {
                    let is_settled = false;
                    let watchdog_timer;
                    const generation_at_start = api_base.connection_generation;

                    const finishSuccess = response => {
                        if (is_settled) return;
                        is_settled = true;
                        clearTimeout(watchdog_timer);
                        if (api_base.connection_generation !== generation_at_start) {
                            mobileTradeLog('Purchase recovered after reconnect', { label });
                        }
                        mobileTradeLog('Buy response received', { label, transaction_id: response?.buy?.transaction_id });
                        onSuccess(response);
                        resolve(response);
                    };

                    const finishFailure = (error, fallback_message) => {
                        if (is_settled) return;
                        is_settled = true;
                        clearTimeout(watchdog_timer);

                        const message =
                            error?.error?.message || error?.message || fallback_message || 'No se pudo completar la compra.';
                        mobileTradeLog('Purchase failed', { label, message });

                        logError(message);
                        contractStatus({ id: 'contract.purchase_failed', data: message });
                        delayIndex = 0;

                        reject(error && (error.error || error.code) ? error : { error: { code: 'PurchaseFailed', message } });
                    };

                    action_promise.then(finishSuccess, finishFailure);

                    watchdog_timer = setTimeout(async () => {
                        if (is_settled) return;
                        mobileTradeLog('Purchase timeout — checking connection health...', { label });

                        if (api_base.connection_generation !== generation_at_start) {
                            // El socket ya cambió por debajo mientras se
                            // esperaba la respuesta: no hay forma segura de
                            // saber si el servidor llegó a procesar la
                            // compra original, así que NO se reintenta
                            // (evita duplicarla).
                            finishFailure(
                                { error: { code: 'ConnectionLost' } },
                                'Se perdió la conexión mientras se esperaba la confirmación de la compra. Verifica tus posiciones abiertas antes de volver a operar.'
                            );
                            return;
                        }

                        const alive = await api_base.checkConnectionAlive(PURCHASE_LIVENESS_TIMEOUT_MS);
                        if (is_settled) return;

                        if (!alive) {
                            api_base.forceReconnect('purchase watchdog: unresponsive socket');
                            finishFailure(
                                { error: { code: 'ConnectionLost' } },
                                'No se pudo confirmar la operación: se perdió la conexión con el servidor. Verifica tus posiciones abiertas antes de volver a operar.'
                            );
                            return;
                        }

                        // La conexión sigue viva: el servidor solo está
                        // tardando más de lo normal. Se da un margen
                        // adicional acotado en vez de cancelar de inmediato.
                        setTimeout(() => {
                            if (is_settled) return;
                            finishFailure(
                                { error: { code: 'ResponseTimeout' } },
                                'El servidor de Deriv tardó demasiado en confirmar la operación. Inténtalo de nuevo.'
                            );
                        }, PURCHASE_HARD_LIMIT_MS - PURCHASE_FIRST_CHECK_MS);
                    }, PURCHASE_FIRST_CHECK_MS);
                });

            if (this.is_proposal_subscription_required) {
                let selected_proposal;
                try {
                    selected_proposal = this.selectProposal(contract_type);
                } catch (error) {
                    contractStatus({ id: 'contract.purchase_sent', data: 0 });
                    return watchPurchase(Promise.reject(error), 'selectProposal');
                }
                const { id, askPrice } = selected_proposal;

                const action = () => api_base.api.send({ buy: id, price: askPrice });

                this.isSold = false;

                mobileTradeLog('Purchase requested', { contract_type, askPrice });
                contractStatus({
                    id: 'contract.purchase_sent',
                    data: askPrice,
                });

                if (!this.options.timeMachineEnabled) {
                    return watchPurchase(doUntilDone(action), 'proposal:doUntilDone');
                }

                const recovered_promise = recoverFromError(
                    action,
                    (errorCode, makeDelay) => {
                        // if disconnected no need to resubscription (handled by live-api)
                        if (errorCode !== 'DisconnectError') {
                            this.renewProposalsOnPurchase();
                        } else {
                            this.clearProposals();
                        }

                        const unsubscribe = this.store.subscribe(() => {
                            const { scope, proposalsReady } = this.store.getState();
                            if (scope === BEFORE_PURCHASE && proposalsReady) {
                                makeDelay().then(() => this.observer.emit('REVERT', 'before'));
                                unsubscribe();
                            }
                        });
                    },
                    ['PriceMoved', 'InvalidContractProposal'],
                    delayIndex++
                );

                return watchPurchase(recovered_promise, 'proposal:recoverFromError');
            }
            const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions);
            const action = () => api_base.api.send(trade_option);

            this.isSold = false;

            mobileTradeLog('Purchase requested', { contract_type, amount: this.tradeOptions.amount });
            contractStatus({
                id: 'contract.purchase_sent',
                data: this.tradeOptions.amount,
            });

            if (!this.options.timeMachineEnabled) {
                return watchPurchase(doUntilDone(action), 'direct:doUntilDone');
            }

            const recovered_promise = recoverFromError(
                action,
                (errorCode, makeDelay) => {
                    if (errorCode === 'DisconnectError') {
                        this.clearProposals();
                    }
                    const unsubscribe = this.store.subscribe(() => {
                        const { scope } = this.store.getState();
                        if (scope === BEFORE_PURCHASE) {
                            makeDelay().then(() => this.observer.emit('REVERT', 'before'));
                            unsubscribe();
                        }
                    });
                },
                ['PriceMoved', 'InvalidContractProposal'],
                delayIndex++
            );

            return watchPurchase(recovered_promise, 'direct:recoverFromError');
        }
        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
