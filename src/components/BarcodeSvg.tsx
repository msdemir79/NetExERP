import React from 'react';
import { encodeCode128 } from '../lib/barcodeGenerator';

interface BarcodeSvgProps {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
  textColor?: string;
  barColor?: string;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  height = 48,
  showText = true,
  className = '',
  textColor = 'text-black',
  barColor = 'black'
}) => {
  const { modules, text } = encodeCode128(value);
  const moduleWidth = 2;
  const totalWidth = modules.length * moduleWidth;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        className="w-full h-auto max-h-16 object-contain"
        shapeRendering="crispEdges"
      >
        {modules.map((isBar, index) => {
          if (!isBar) return null;
          return (
            <rect
              key={index}
              x={index * moduleWidth}
              y={0}
              width={moduleWidth}
              height={height}
              fill={barColor}
            />
          );
        })}
      </svg>
      {showText && (
        <span className={`font-mono text-[11px] font-black tracking-[0.25em] ${textColor} mt-0.5 select-all uppercase`}>
          {text}
        </span>
      )}
    </div>
  );
};
