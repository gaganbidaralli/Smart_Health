/**
 * @file CustomDropdown.jsx
 * @description Premium glassmorphism dropdown that bypasses native browser
 * `<select>` colour limitations. Closes on outside-click via a window listener.
 */

import React, { useState, useEffect } from 'react';

// ─── Shared Style Objects (module-scope to avoid per-render allocations) ───────
const TRIGGER_BASE_STYLE = {
  background:     'rgba(17, 24, 39, 0.65)',
  border:         '1px solid var(--border-glass)',
  borderRadius:   '6px',
  padding:        '10px 14px',
  fontSize:       '13px',
  cursor:         'pointer',
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
  width:          '100%',
  boxSizing:      'border-box',
  minHeight:      '38px',
  userSelect:     'none',
};

const PANEL_STYLE = {
  position:       'absolute',
  top:            '100%',
  left:           0,
  right:          0,
  marginTop:      '4px',
  background:     '#111827',
  border:         '1px solid var(--border-glass)',
  borderRadius:   '6px',
  maxHeight:      '220px',
  overflowY:      'auto',
  zIndex:         99999,
  boxShadow:      '0 8px 32px rgba(0, 0, 0, 0.8)',
  backdropFilter: 'blur(16px)',
};

const OPTION_BASE_STYLE = {
  padding:      '10px 14px',
  fontSize:     '13px',
  cursor:       'pointer',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  textAlign:    'left',
  transition:   'background 0.15s ease',
};

/**
 * @param {object}   props
 * @param {string}   props.value       - Currently selected value
 * @param {Function} props.onChange    - Called with the new value string on selection
 * @param {{value: string|number, label: string}[]} props.options
 * @param {string}  [props.placeholder]
 * @param {string}  [props.width]      - CSS width of the trigger (default: 'auto')
 * @param {string}  [props.color]      - CSS color of the selected-value text
 */
function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  width = 'auto',
  color = 'white',
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Close on any outside click while open
  useEffect(() => {
    if (!isOpen) return;
    const clickHandler = () => setIsOpen(false);
    window.addEventListener('click', clickHandler);
    return () => window.removeEventListener('click', clickHandler);
  }, [isOpen]);

  const selected = options.find(opt => opt.value === value);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', width, zIndex: isOpen ? 9999 : 100 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{ ...TRIGGER_BASE_STYLE, color }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '6px' }}>▼</span>
      </div>

      {/* Option panel */}
      {isOpen && (
        <div style={PANEL_STYLE}>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              style={{
                ...OPTION_BASE_STYLE,
                color:      opt.value === value ? 'var(--neon-blue)' : 'white',
                background: opt.value === value ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
              onMouseLeave={e => {
                e.currentTarget.style.background =
                  opt.value === value ? 'rgba(59, 130, 246, 0.12)' : 'transparent';
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomDropdown;
