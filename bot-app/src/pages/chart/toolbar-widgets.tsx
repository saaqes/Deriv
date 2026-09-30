// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import { memo } from 'react';
import { ChartMode, DrawTools, ToolbarWidget } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';

type TToolbarWidgetsProps = {
    updateChartType: (chart_type: string) => void;
    updateGranularity: (updateGranularity: number) => void;
    position?: string | null;
    isDesktop?: boolean;
};

// Únicos botones visibles encima de la gráfica: ChartMode (tipo de gráfica +
// intervalo) y DrawTools (herramienta de marcadores/dibujo). StudyLegend
// (indicadores), Views y Share se quitaron a propósito — no deben
// renderizarse ni en desktop ni en mobile.
//
// El ícono de DrawTools se reemplaza visualmente por uno propio (compás de
// dibujo técnico, provisto por el usuario): se superpone un <svg> encima y
// se oculta el ícono original vía CSS (ver chart.scss, clase
// .dtools-custom-icon-wrap). No se puede cambiar el ícono interno del
// componente DrawTools (es de la librería @deriv-com/smartcharts-champion),
// así que se tapa con este.
const ToolbarWidgets = ({ updateChartType, updateGranularity, position }: TToolbarWidgetsProps) => {
    const { isMobile } = useDevice();
    const validPosition = position === 'top' || position === 'bottom' ? position : 'top';

    return (
        <ToolbarWidget position={validPosition || (isMobile ? 'bottom' : null)}>
            <ChartMode portalNodeId='modal_root' onChartType={updateChartType} onGranularity={updateGranularity} />
            <span className='dtools-custom-icon-wrap'>
                <DrawTools portalNodeId='modal_root' />
                <svg
                    className='dtools-custom-icon'
                    viewBox='0 0 24 30'
                    aria-hidden='true'
                    focusable='false'
                >
                    <path d='M23.925,23.236l-4.996-8.05c.844-.473,1.651-1.036,2.402-1.695,.207-.183,.228-.499,.046-.706-.183-.208-.499-.228-.706-.046-.709,.623-1.471,1.153-2.269,1.597l-3.476-5.6-.008-.008c.669-.715,1.083-1.673,1.083-2.728,0-2.036-1.53-3.718-3.5-3.965V.5c0-.276-.224-.5-.5-.5s-.5,.224-.5,.5v1.535c-1.97,.247-3.5,1.929-3.5,3.965,0,1.055,.413,2.013,1.083,2.728l-.008,.008-3.476,5.6c-.798-.444-1.56-.974-2.269-1.597-.206-.182-.523-.162-.706,.046-.182,.208-.161,.523,.046,.706,.751,.659,1.558,1.222,2.402,1.695L.075,23.236c-.146,.234-.073,.543,.161,.688,.082,.051,.173,.075,.264,.075,.167,0,.33-.084,.425-.236L5.962,15.648c1.906,.896,3.972,1.345,6.038,1.345s4.132-.449,6.038-1.345l5.037,8.116c.095,.152,.258,.236,.425,.236,.091,0,.182-.024,.264-.075,.234-.146,.307-.454,.161-.688ZM12,3c1.654,0,3,1.346,3,3s-1.346,3-3,3-3-1.346-3-3,1.346-3,3-3ZM6.494,14.791l3.363-5.419c.62,.395,1.354,.628,2.143,.628s1.522-.232,2.143-.628l3.363,5.419c-3.483,1.601-7.529,1.601-11.012,0Z' />
                </svg>
            </span>
        </ToolbarWidget>
    );
};

export default memo(ToolbarWidgets);
