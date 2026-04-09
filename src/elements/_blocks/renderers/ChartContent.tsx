import { memo } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts'
import { DEFAULT_CHART_COLORS } from '../constants'

interface ChartContentProps {
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  data: Record<string, unknown>[]
  xAxisKey?: string
  yAxisKeys?: string[]
  colors?: string[]
  showLegend?: boolean
  showGrid?: boolean
}

export const ChartContent = memo(function ChartContent({
  chartType,
  data,
  xAxisKey = 'name',
  yAxisKeys = ['value'],
  colors = [...DEFAULT_CHART_COLORS],
  showLegend = true,
  showGrid = true,
}: ChartContentProps) {
  if (!data.length) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f9fafb', border: '1px dashed #d1d5db',
        fontSize: '2.5mm', color: '#9ca3af',
      }}>
        データなし
      </div>
    )
  }

  switch (chartType) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yAxisKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )

    case 'line':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yAxisKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )

    case 'pie':
    case 'donut':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={yAxisKeys[0] ?? 'value'}
              nameKey={xAxisKey}
              cx="50%"
              cy="50%"
              innerRadius={chartType === 'donut' ? '40%' : 0}
              outerRadius="75%"
              label={chartType === 'pie'}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          </PieChart>
        </ResponsiveContainer>
      )
  }
})
