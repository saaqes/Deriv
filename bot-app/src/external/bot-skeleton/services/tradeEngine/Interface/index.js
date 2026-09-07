import TradeEngine from '../trade';
import getBotInterface from './BotInterface';
import getTicksInterface from './TicksInterface';
import getToolsInterface from './ToolsInterface';

const sleep = (observer, arg = 1) => {
    return new Promise(
        r =>
            // eslint-disable-next-line no-promise-executor-return
            setTimeout(() => {
                r();
                setTimeout(() => observer.emit('CONTINUE'), 0);
            }, arg * 1000),
        () => {}
    );
};

const Interface = $scope => {
    const tradeEngine = new TradeEngine($scope);
    const { observer } = $scope;
    const getInterface = () => {
        return {
            ...getBotInterface(tradeEngine),
            ...getToolsInterface(tradeEngine),
            getTicksInterface: getTicksInterface(tradeEngine),
            watch: (...args) => tradeEngine.watch(...args),
            sleep: (...args) => sleep(observer, ...args),
            // Alert/prompt nativos del navegador — muestran el origen
            // real del sitio, tal como el navegador los genera. No se
            // puede (ni se debe) sobrescribir esa etiqueta de origen:
            // es un indicador de seguridad que el navegador controla,
            // no la página.
            alert: (...args) => window.alert(...args),
            prompt: (...args) => window.prompt(...args),
            console: {
                log(...args) {
                    // eslint-disable-next-line no-console
                    console.log(new Date().toLocaleTimeString(), ...args);
                },
            },
        };
    };
    return { tradeEngine, observer, getInterface };
};

export default Interface;
