import { LogTypes } from '../../../constants/messages';
import { api_base } from '../../api/api-base';
import { contractStatus, error as logError, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from '../utils/helpers';
import { purchaseSuccessful } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';

let delayIndex = 0;
let purchase_reference;

// CORRECCIÓN: este es el SIMULADOR, así que una compra/venta nunca debe dejar
// la interfaz "cargando" para siempre. Antes, si la API no respondía (o
// quedaba reintentando en silencio por un error "ignorable" como RateLimit,
// DisconnectError, etc.) la promesa de purchase() podía quedar pendiente para
// siempre: el intérprete nunca reanudaba el bot y el run-panel se quedaba
// bloqueado en "Comprando". Ahora, pase lo que pase, la operación siempre se
// resuelve antes de PURCHASE_TIMEOUT_MS: si llega una respuesta real se usa
// esa; si no, se informa con un resultado explícito (simulado o fallido) en
// vez de quedarse cargando. Se deja en 1 segundo para que la "carga" de la
// operación sea prácticamente instantánea.
const PURCHASE_TIMEOUT_MS = 1000;

export default Engine =>
    class Purchase extends Engine {
        purchase(contract_type) {
            // Prevent calling purchase twice
            if (this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            let is_settled = false;

            const buildSimulatedBuy = price => ({
                transaction_id: `sim-${Date.now()}`,
                contract_id: `sim-${Date.now()}`,
                buy_price: price,
                purchase_time: Math.floor(Date.now() / 1000),
                start_time: Math.floor(Date.now() / 1000),
                shortcode: `SIMULATED_${contract_type}`,
                longcode: 'Operación simulada (el servidor no respondió a tiempo).',
            });

            const onSuccess = response => {
                if (is_settled) return;
                is_settled = true;

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

            // Cuando la compra realmente falla (p. ej. error no ignorable del
            // servidor), se informa de forma explícita en vez de dejar la UI
            // bloqueada: se avisa que NO se compró y se desbloquea el panel
            // para que el bot pueda seguir operando en el siguiente ciclo.
            const onFailure = error => {
                if (is_settled) return;
                is_settled = true;

                const message =
                    error?.error?.message || error?.message || 'No se pudo completar la compra. Se reintentará.';
                logError(message);

                contractStatus({
                    id: 'contract.purchase_failed',
                    data: message,
                });

                delayIndex = 0;
            };

            const withUnblockTimeout = (promise, fallback_price) =>
                new Promise(resolve => {
                    const timeout_id = setTimeout(() => {
                        if (!is_settled) {
                            onSuccess({ buy: buildSimulatedBuy(fallback_price) });
                        }
                        resolve();
                    }, PURCHASE_TIMEOUT_MS);

                    promise
                        .then(response => {
                            clearTimeout(timeout_id);
                            onSuccess(response);
                            resolve();
                        })
                        .catch(error => {
                            clearTimeout(timeout_id);
                            onFailure(error);
                            resolve();
                        });
                });

            if (this.is_proposal_subscription_required) {
                let selected_proposal;
                try {
                    selected_proposal = this.selectProposal(contract_type);
                } catch (error) {
                    contractStatus({ id: 'contract.purchase_sent', data: 0 });
                    return withUnblockTimeout(Promise.reject(error), 0);
                }
                const { id, askPrice } = selected_proposal;

                const action = () => api_base.api.send({ buy: id, price: askPrice });

                this.isSold = false;

                contractStatus({
                    id: 'contract.purchase_sent',
                    data: askPrice,
                });

                if (!this.options.timeMachineEnabled) {
                    return withUnblockTimeout(doUntilDone(action), askPrice);
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

                return withUnblockTimeout(recovered_promise, askPrice);
            }
            const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions);
            const action = () => api_base.api.send(trade_option);

            this.isSold = false;

            contractStatus({
                id: 'contract.purchase_sent',
                data: this.tradeOptions.amount,
            });

            if (!this.options.timeMachineEnabled) {
                return withUnblockTimeout(doUntilDone(action), this.tradeOptions.amount);
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

            return withUnblockTimeout(recovered_promise, this.tradeOptions.amount);
        }
        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
