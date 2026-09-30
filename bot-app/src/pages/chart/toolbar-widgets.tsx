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
// El ícono de DrawTools se reemplaza visualmente por uno propio (lápiz/
// "drawing tool"): se superpone un <svg> encima y se oculta el ícono
// original vía CSS (ver chart.scss, clase .dtools-custom-icon-wrap). No se
// puede cambiar el ícono interno del componente DrawTools (es de la
// librería @deriv-com/smartcharts-champion), así que se tapa con este.
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
                    viewBox='0 0 24 24'
                    aria-hidden='true'
                    focusable='false'
                >
                    <path d='M2.291 21.955l-.039-.02a.5.5 0 0 1-.18-.176l-.009-.015a.486.486 0 0 1-.037-.402l2-6a.5.5 0 0 1 .047-.101l.033-.049.04-.046 13-13a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-13 13a.501.501 0 0 1-.196.12L5.582 21 19.5 21a.5.5 0 0 1 .492.41l.008.09a.5.5 0 0 1-.5.5H2.515a.486.486 0 0 1-.187-.03l-.006-.002a.226.226 0 0 1-.03-.013zm2.427-5.53l-1.427 4.284 4.283-1.428-2.856-2.856zM15 5.707L5.207 15.5 8.5 18.792l9.793-9.793L15 5.707zm2.5-2.5L15.707 5 19 8.292 20.793 6.5 17.5 3.207z' />
                </svg>
            </span>
        </ToolbarWidget>
    );
};

export default memo(ToolbarWidgets);
