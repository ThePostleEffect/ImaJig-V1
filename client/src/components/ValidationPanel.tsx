import React from 'react';
import { ValidationResult } from '../engine/validator';

interface ValidationPanelProps {
  result: ValidationResult | null;
  onValidate: () => void;
}

export function ValidationPanel({ result, onValidate }: ValidationPanelProps) {
  if (!result) {
    return (
      <div className="absolute top-16 left-4 z-50 bg-white border-2 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <button 
          onClick={onValidate}
          className="bg-blue-600 text-white px-3 py-1 font-bold hover:bg-blue-700 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none transition-all"
        >
          VALIDATE
        </button>
      </div>
    );
  }

  const statusColor = result.passed ? 'text-green-600' : 'text-red-600';
  const statusBg = result.passed ? 'bg-green-100' : 'bg-red-100';

  return (
    <div className="absolute top-16 left-4 z-50 bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-w-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-lg">VALIDATION</h3>
        <button 
          onClick={onValidate}
          className="text-xs bg-gray-200 px-2 py-1 border border-black hover:bg-gray-300"
        >
          RERUN
        </button>
      </div>
      
      <div className={`font-mono font-bold text-xl mb-4 ${statusColor} ${statusBg} p-2 border border-black text-center`}>
        {result.passed ? 'PASS' : 'FAIL'}
      </div>

      <div className="space-y-1 text-sm font-mono">
        <CheckRow label="Count" check={result.checks.count} />
        <CheckRow label="Integrity" check={result.checks.integrity} />
        <CheckRow label="Coverage" check={result.checks.coverage} />
        <CheckRow label="Flushness" check={result.checks.flushness} />
        <CheckRow label="Flatness" check={result.checks.flatness} />
      </div>

      {result.errors.length > 0 && (
        <div className="mt-4 pt-2 border-t-2 border-black max-h-40 overflow-y-auto">
          <div className="font-bold text-xs mb-1">ERRORS:</div>
          {result.errors.map((err, i) => (
            <div key={i} className="text-xs text-red-600 mb-1 break-words">
              • {err}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ label, check }: { label: string, check: { passed: boolean, message: string } }) {
  return (
    <div className="flex justify-between items-center">
      <span>{label}:</span>
      <span className={check.passed ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
        {check.passed ? 'OK' : 'FAIL'}
      </span>
    </div>
  );
}
