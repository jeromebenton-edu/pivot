import { ChartConfig } from '@/lib/types';

export interface DAXOutput {
  measures: { name: string; formula: string; description: string }[];
  calculatedColumns: { name: string; formula: string }[];
}

// Sanitize identifiers used in DAX formulas to prevent injection (#R9-7)
function sanitizeDAXId(name: string): string {
  return name.replace(/[\[\]\(\)\n\r\\]/g, '').slice(0, 128);
}

export function generateDAX(config: ChartConfig): DAXOutput {
  const measures: DAXOutput['measures'] = [];
  const calculatedColumns: DAXOutput['calculatedColumns'] = [];

  const yKey = sanitizeDAXId(config.yAxis?.dataKey || 'value');
  const xKey = sanitizeDAXId(config.xAxis?.dataKey || 'name');
  const tableName = 'Data';

  // Base measure
  if (yKey === 'revenue' || yKey === 'value') {
    measures.push({
      name: 'Total Revenue',
      formula: `Total Revenue = SUM(${tableName}[${yKey}])`,
      description: 'Sum of all revenue values',
    });

    measures.push({
      name: 'Average Revenue',
      formula: `Average Revenue = AVERAGE(${tableName}[${yKey}])`,
      description: 'Average revenue per record',
    });
  }

  // Chart-type specific measures
  switch (config.type) {
    case 'line':
      if (config.data.some(d => d.forecast !== undefined)) {
        measures.push({
          name: 'Forecast Value',
          formula: `Forecast Value = \nVAR CurrentMonth = MAX(${tableName}[${xKey}])\nVAR HistoricalAvg = CALCULATE(AVERAGE(${tableName}[actual]), ALLEXCEPT(${tableName}, ${tableName}[${xKey}]))\nRETURN\n    IF(ISBLANK(MAX(${tableName}[actual])), MAX(${tableName}[forecast]), MAX(${tableName}[actual]))`,
          description: 'Shows actual when available, forecast otherwise',
        });

        measures.push({
          name: 'YoY Growth',
          formula: `YoY Growth = \nVAR CurrentValue = [Total Revenue]\nVAR PriorYear = CALCULATE([Total Revenue], DATEADD(${tableName}[${xKey}], -12, MONTH))\nRETURN\n    DIVIDE(CurrentValue - PriorYear, PriorYear, 0)`,
          description: 'Year-over-year growth rate',
        });
      }

      measures.push({
        name: 'Running Total',
        formula: `Running Total = \nCALCULATE(\n    [Total Revenue],\n    FILTER(\n        ALLSELECTED(${tableName}[${xKey}]),\n        ${tableName}[${xKey}] <= MAX(${tableName}[${xKey}])\n    )\n)`,
        description: 'Cumulative running total',
      });
      break;

    case 'bar':
      measures.push({
        name: `Top ${xKey} by Revenue`,
        formula: `Top Category = \nCALCULATE(\n    [Total Revenue],\n    TOPN(5, ALL(${tableName}[${xKey}]), [Total Revenue])\n)`,
        description: `Revenue for top 5 ${xKey} values`,
      });

      if (yKey.includes('rate') || yKey.includes('Rate')) {
        measures.push({
          name: 'Weighted Rate',
          formula: `Weighted Rate = SUMX(${tableName}, ${tableName}[${yKey}] * ${tableName}[orders]) / SUM(${tableName}[orders])`,
          description: 'Order-weighted rate calculation',
        });
      }
      break;

    case 'pie':
      measures.push({
        name: 'Percentage of Total',
        formula: `% of Total = \nDIVIDE(\n    [Total Revenue],\n    CALCULATE([Total Revenue], ALLSELECTED(${tableName}[${xKey}])),\n    0\n)`,
        description: 'Each slice as percentage of total',
      });
      break;
  }

  // Period comparison
  measures.push({
    name: 'Prior Period',
    formula: `Prior Period Revenue = CALCULATE([Total Revenue], PREVIOUSMONTH(${tableName}[${xKey}]))`,
    description: 'Revenue from prior period for comparison',
  });

  return { measures, calculatedColumns };
}
