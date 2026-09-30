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
const ToolbarWidgets = ({ updateChartType, updateGranularity, position }: TToolbarWidgetsProps) => {
    const { isMobile } = useDevice();
    const validPosition = position === 'top' || position === 'bottom' ? position : 'top';

    return (
        <ToolbarWidget position={validPosition || (isMobile ? 'bottom' : null)}>
            <ChartMode portalNodeId='modal_root' onChartType={updateChartType} onGranularity={updateGranularity} />
            <DrawTools portalNodeId='modal_root' />
        </ToolbarWidget>
    );
};

export default memo(ToolbarWidgets);
