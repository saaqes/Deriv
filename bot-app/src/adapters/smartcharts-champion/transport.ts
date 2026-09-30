/**
 * Transport layer wrapper for SmartCharts Champion Adapter
 * Wraps the existing chart_api.api to match the TTransport interface
 */

import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import type { TTransport } from './types';

// Logger utility for transport layer
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Transport]'),
    error: console.error.bind(console, '[SmartCharts Transport]'),
};

/**
 * Create transport wrapper around chart_api.api
 * @returns TTransport implementation
 */
export function createTransport(): TTransport {
    const subscriptions = new Map<string, any>();

    // Arma (o rearma) la escucha de mensajes + el envío de la petición de
    // suscripción para un tempId dado, contra la instancia ACTUAL de
    // chart_api.api. Se usa tanto para la primera suscripción como para
    // volver a levantarla después de una reconexión del socket (ver
    // registro de onReconnect más abajo) — en ese caso se reutiliza el
    // mismo tempId (y por lo tanto la misma callback ya entregada al que
    // llamó a subscribe()), solo se reemplaza la conexión interna.
    const establishSubscription = (tempId: string, subscribeRequest: any, callback: (response: any) => void) => {
        if (!chart_api.api) return;

        let initialResponseDelivered = false;

        const confirmSubscriptionId = (subscriptionId: string, initialData: any) => {
            const storedSub = subscriptions.get(tempId);
            if (!storedSub) return;

            if (!storedSub.realSubscriptionId) {
                storedSub.realSubscriptionId = subscriptionId;
                subscriptions.set(tempId, storedSub);
            }

            if (!initialResponseDelivered) {
                initialResponseDelivered = true;
                callback(initialData);
            }
        };

        // Set up global message listener first (before sending request)
        const messageSubscription = chart_api.api.onMessage()?.subscribe(({ data }: { data: any }) => {
            const subscriptionId = data?.subscription?.id;
            if (!subscriptionId) return;

            const storedSub = subscriptions.get(tempId);
            if (!storedSub) return;

            if (!storedSub.realSubscriptionId) {
                // Primer mensaje que trae este ID -> es la
                // confirmación (puede ser la propia respuesta al
                // send(), vista aquí antes de que su promesa
                // resuelva, o el primer tick en vivo).
                confirmSubscriptionId(subscriptionId, data);
                return;
            }

            // Ya confirmado: solo reenviar los mensajes LIVE que
            // realmente pertenecen a esta suscripción.
            if (subscriptionId === storedSub.realSubscriptionId) {
                callback(data);
            }
        });

        // Store/replace subscription info under the same temp ID
        subscriptions.set(tempId, {
            request: subscribeRequest,
            callback,
            messageSubscription,
            realSubscriptionId: null, // Will be set when we get the first response
        });

        // Send the subscription request
        chart_api.api
            .send(subscribeRequest)
            .then((response: any) => {
                const subscriptionId = response?.subscription?.id;

                if (subscriptionId) {
                    confirmSubscriptionId(subscriptionId, response);
                } else {
                    logger.error('No subscription ID in response:', response);
                }
            })
            .catch((error: any) => {
                logger.error('Subscription failed:', error);
                // Clean up failed subscription
                const storedSub = subscriptions.get(tempId);
                if (storedSub?.messageSubscription) {
                    storedSub.messageSubscription.unsubscribe();
                }
                subscriptions.delete(tempId);
            });
    };

    // El socket del gráfico puede cerrarse y volver a abrirse solo (red
    // inestable, la pestaña vuelve de segundo plano, etc.). Cuando eso
    // pasa, chart_api.api pasa a ser una instancia nueva: los
    // `messageSubscription` ya armados siguen escuchando el socket VIEJO
    // (que nunca más va a emitir nada) y el gráfico se queda "congelado"
    // sin ningún error visible, aunque la app siga funcionando. Al
    // reconectar, se vuelve a levantar cada suscripción viva contra el
    // socket nuevo, con el mismo tempId y la misma callback — así los
    // precios en vivo vuelven a fluir sin que el usuario tenga que
    // recargar la página.
    chart_api.onReconnect(() => {
        subscriptions.forEach((storedSub, tempId) => {
            if (storedSub.messageSubscription) {
                try {
                    storedSub.messageSubscription.unsubscribe();
                } catch {
                    // Ignore: the old socket is already gone.
                }
            }
            establishSubscription(tempId, storedSub.request, storedSub.callback);
        });
    });

    return {
        /**
         * Send one-shot API request
         */
        async send(request: any): Promise<any> {
            if (!chart_api.api) {
                await chart_api.init();
            }
            return chart_api.api.send(request);
        },

        /**
         * Subscribe to streaming data
         * @param request - API request with subscribe: 1
         * @param callback - Callback for streaming updates
         * @returns subscription ID
         */
        subscribe(request: any, callback: (response: any) => void): string {
            if (!chart_api.api) {
                throw new Error('Chart API not initialized');
            }
            // Generate a unique temporary ID for tracking
            const tempId = `temp-${Date.now()}-${Math.random()}`;

            // Send initial subscription request
            const subscribeRequest = { ...request, subscribe: 1 };

            establishSubscription(tempId, subscribeRequest, callback);

            return tempId;
        },

        /**
         * Unsubscribe from streaming data
         * @param subscriptionId - Subscription ID to cancel (temp ID)
         */
        unsubscribe(subscriptionId: string): void {
            const subscription = subscriptions.get(subscriptionId);

            if (subscription) {
                // Cancel RxJS subscription
                if (subscription.messageSubscription) {
                    subscription.messageSubscription.unsubscribe();
                }

                // Send forget request to server using the real subscription ID
                if (chart_api.api && subscription.realSubscriptionId) {
                    chart_api.api.forget(subscription.realSubscriptionId);
                }

                // Clean up local storage
                subscriptions.delete(subscriptionId);
            } else {
                logger.warn('No subscription found for ID:', subscriptionId);
            }
        },

        /**
         * Unsubscribe from all streaming data of a specific type
         * @param msgType - Message type to unsubscribe from (optional)
         */
        unsubscribeAll(msgType?: string): void {
            if (chart_api.api) {
                if (msgType) {
                    chart_api.api.forgetAll(msgType);
                } else {
                    // Forget all ticks by default
                    chart_api.api.forgetAll('ticks');
                }
            }

            // Clean up local subscriptions
            subscriptions.clear();
        },
    };
}
