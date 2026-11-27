import { fieldLabelStyle, fieldInputStyle } from './Modal';

// The two forecast boxes of a deal. An empty chance means "as the stage says".
export default function ForecastFields({ closeDate, probability, stageChance, onCloseDate, onProbability }: {
  closeDate: string;
  probability: string;
  stageChance: number;
  onCloseDate: (value: string) => void;
  onProbability: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 160px' }}>
        <label style={fieldLabelStyle} htmlFor="deal-close-date">Expected close date</label>
        <input id="deal-close-date" style={fieldInputStyle} type="date" value={closeDate} onChange={(e) => onCloseDate(e.target.value)} />
      </div>
      <div style={{ flex: '1 1 120px' }}>
        <label style={fieldLabelStyle} htmlFor="deal-probability">Chance of closing (%)</label>
        <input id="deal-probability" style={fieldInputStyle} type="number" min="0" max="100" value={probability} placeholder={`${stageChance} (from the stage)`} onChange={(e) => onProbability(e.target.value)} />
      </div>
    </div>
  );
}
