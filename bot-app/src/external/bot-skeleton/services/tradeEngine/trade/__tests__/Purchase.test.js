/**
 * Tests mínimos para el arreglo del bug "se queda cargando en Buying
 * contract" en móvil (ver Purchase.js). Cubren los escenarios pedidos:
 *  A) compra normal
 *  B) buy response tardía
 *  C) WebSocket desconectado durante la compra (reconexión real detectada)
 *  D) WebSocket "reconectado" pero conexión sigue viva -> solo se espera más
 *  E) error de buy (respuesta real de error del servidor)
 *  F) timeout real (conexión viva pero el servidor nunca responde)
 *  G) nunca se reintenta/duplica la compra automáticamente
 */
import { api_base } from '../../../api/api-base';
import { contractStatus, error as logError } from '../../utils/broadcast';
import { doUntilDone } from '../../utils/helpers';
import Purchase from '../Purchase';
import { BEFORE_PURCHASE } from '../state/constants';

jest.mock('../../../api/api-base', () => ({
    api_base: {
        api: { send: jest.fn() },
        connection_generation: 0,
        checkConnectionAlive: jest.fn(),
        forceReconnect: jest.fn(),
    },
}));

jest.mock('../../utils/broadcast', () => ({
    contractStatus: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
}));

jest.mock('../../utils/helpers', () => ({
    doUntilDone: jest.fn(action => action()),
    recoverFromError: jest.fn(),
    getUUID: () => 'uuid-test',
    tradeOptionToBuy: jest.fn(() => ({ buy: '1', parameters: {} })),
}));

class BaseEngine {
    constructor() {
        this.store = {
            getState: jest.fn(() => ({ scope: BEFORE_PURCHASE })),
            dispatch: jest.fn(),
            subscribe: jest.fn(() => jest.fn()),
        };
        this.options = { timeMachineEnabled: false };
        this.is_proposal_subscription_required = false;
        this.tradeOptions = { amount: 10, currency: 'USD', symbol: 'R_100' };
        this.accountInfo = { loginid: 'VRT123' };
        this.isSold = false;
        this.observer = { emit: jest.fn() };
    }
    selectProposal() {
        return { id: 'prop1', askPrice: 10 };
    }
    renewProposalsOnPurchase() {}
    clearProposals() {}
    updateAndReturnTotalRuns() {
        return 1;
    }
}

const PurchaseEngine = Purchase(BaseEngine);

const buildInstance = () => new PurchaseEngine();

beforeEach(() => {
    jest.clearAllMocks();
    api_base.connection_generation = 0;
    api_base.checkConnectionAlive.mockResolvedValue(true);
});

describe('Purchase() — flujo de compra robusto en móvil', () => {
    test('A) compra normal: resuelve de inmediato con la respuesta real del servidor', async () => {
        const buyResponse = { buy: { transaction_id: 't1', contract_id: 'c1', buy_price: 10 } };
        api_base.api.send.mockResolvedValue(buyResponse);

        const instance = buildInstance();
        await expect(instance.purchase('CALL')).resolves.toEqual(buyResponse);

        expect(contractStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'contract.purchase_sent' }));
        expect(contractStatus).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'contract.purchase_received', buy: buyResponse.buy })
        );
        expect(api_base.api.send).toHaveBeenCalledTimes(1);
    });

    test('B) buy response tardía: igual se confirma como éxito si llega antes del límite máximo', async () => {
        jest.useFakeTimers();
        const buyResponse = { buy: { transaction_id: 't2', contract_id: 'c2', buy_price: 10 } };
        let resolveSend;
        api_base.api.send.mockReturnValue(
            new Promise(resolve => {
                resolveSend = resolve;
            })
        );

        const instance = buildInstance();
        const purchasePromise = instance.purchase('CALL');

        // Pasa el primer chequeo (6s) con la conexión viva: debe seguir
        // esperando en vez de cancelar.
        await jest.advanceTimersByTimeAsync(6000);
        expect(api_base.checkConnectionAlive).toHaveBeenCalled();
        expect(contractStatus).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'contract.purchase_failed' }));

        // La respuesta real llega tarde (8s en total) pero antes del límite
        // de 15s: debe tratarse como éxito real, nunca como una compra
        // inventada.
        resolveSend(buyResponse);
        await purchasePromise.then(result => {
            expect(result).toEqual(buyResponse);
        });

        expect(contractStatus).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'contract.purchase_received', buy: buyResponse.buy })
        );
        jest.useRealTimers();
    });

    test('C) WebSocket desconectado durante la compra: no reintenta, informa el fallo real', async () => {
        jest.useFakeTimers();
        api_base.api.send.mockReturnValue(new Promise(() => {})); // nunca responde

        const instance = buildInstance();
        const purchasePromise = instance.purchase('CALL');
        purchasePromise.catch(() => {}); // evita unhandled rejection warning

        // Simula que, mientras se esperaba la respuesta, el socket cambió
        // (reconexión real) antes del primer chequeo del watchdog.
        api_base.connection_generation = 1;

        await jest.advanceTimersByTimeAsync(6000);

        await expect(purchasePromise).rejects.toEqual(
            expect.objectContaining({ error: expect.objectContaining({ code: 'ConnectionLost' }) })
        );
        expect(contractStatus).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'contract.purchase_failed' })
        );
        // No se reintenta el buy original: sigue habiendo una sola llamada.
        expect(api_base.api.send).toHaveBeenCalledTimes(1);
        // No se fuerza una reconexión manual: ya hubo una (por eso cambió
        // connection_generation), forzar otra sería redundante.
        expect(api_base.forceReconnect).not.toHaveBeenCalled();
        jest.useRealTimers();
    });

    test('D) conexión sigue viva tras el primer chequeo: se espera más tiempo en vez de cancelar de inmediato', async () => {
        jest.useFakeTimers();
        const buyResponse = { buy: { transaction_id: 't4', contract_id: 'c4', buy_price: 10 } };
        let resolveSend;
        api_base.api.send.mockReturnValue(
            new Promise(resolve => {
                resolveSend = resolve;
            })
        );
        api_base.checkConnectionAlive.mockResolvedValue(true);

        const instance = buildInstance();
        const purchasePromise = instance.purchase('CALL');

        await jest.advanceTimersByTimeAsync(6000);
        expect(api_base.checkConnectionAlive).toHaveBeenCalledTimes(1);
        // Todavía no se da por fallida: la conexión respondió viva.
        expect(contractStatus).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'contract.purchase_failed' }));

        resolveSend(buyResponse);
        await purchasePromise;
        expect(contractStatus).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'contract.purchase_received' })
        );
        jest.useRealTimers();
    });

    test('E) error real de compra del servidor: se informa de inmediato, sin esperar el watchdog', async () => {
        const serverError = { error: { code: 'InsufficientBalance', message: 'No tienes fondos suficientes.' } };
        api_base.api.send.mockRejectedValue(serverError);

        const instance = buildInstance();
        await expect(instance.purchase('CALL')).rejects.toEqual(serverError);

        expect(logError).toHaveBeenCalledWith('No tienes fondos suficientes.');
        expect(contractStatus).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'contract.purchase_failed', data: 'No tienes fondos suficientes.' })
        );
    });

    test('F) timeout real: conexión viva pero el servidor nunca responde -> falla tras el límite máximo, nunca se queda cargando', async () => {
        jest.useFakeTimers();
        api_base.api.send.mockReturnValue(new Promise(() => {}));
        api_base.checkConnectionAlive.mockResolvedValue(true);

        const instance = buildInstance();
        const purchasePromise = instance.purchase('CALL');
        purchasePromise.catch(() => {});

        await jest.advanceTimersByTimeAsync(15000); // límite máximo total

        await expect(purchasePromise).rejects.toEqual(
            expect.objectContaining({ error: expect.objectContaining({ code: 'ResponseTimeout' }) })
        );
        expect(contractStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'contract.purchase_failed' }));
        jest.useRealTimers();
    });

    test('G) nunca se duplica la compra: el socket (action) solo se invoca una vez incluso si hay reconexión/timeout', async () => {
        jest.useFakeTimers();
        api_base.api.send.mockReturnValue(new Promise(() => {}));
        api_base.checkConnectionAlive.mockResolvedValue(false);

        const instance = buildInstance();
        const purchasePromise = instance.purchase('CALL');
        purchasePromise.catch(() => {});

        await jest.advanceTimersByTimeAsync(6000);

        await expect(purchasePromise).rejects.toBeDefined();
        expect(api_base.api.send).toHaveBeenCalledTimes(1);
        expect(doUntilDone).toHaveBeenCalledTimes(1);
        // Socket confirmado muerto -> se fuerza una reconexión real (una
        // sola vez), pero jamás se reenvía la orden de compra.
        expect(api_base.forceReconnect).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });
});
