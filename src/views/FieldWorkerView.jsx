/**
 * @file FieldWorkerView.jsx
 * @description Mobile-first console for the FIELD_WORKER role.
 * Renders: Manual stock log entry form and the multilingual voice interface.
 */

import React from 'react';
import CustomDropdown from '../components/CustomDropdown';

// ─── Voice Sample Queries ──────────────────────────────────────────────────────
// Defined at module scope — this array is static and never changes at runtime.
const VOICE_SAMPLE_QUERIES = [
  {
    lang:       'Hindi',
    text:       'ORS पैकेट कितने बचे हैं? (How many ORS packets left?)',
    transcript: 'ORS packets left at PHC Alandur',
    response:   `┌─────────────────────────────────────────────┐\n│ 🟡 STOCK WARNING                            │\n│ Center: PHC Alandur | Block: St. Thomas Mou │\n│ Medicine: ORS Packets | Current: 15 units   │\n│ Buffer needed: 100 units                    │\n│ Days to stock-out: 3.0 days                 │\n│ Action: raise procurement order             │\n└─────────────────────────────────────────────┘\n\n[Voice output - Hindi]: प्राथमिक स्वास्थ्य केंद्र अलंदूर में १५ ओआरएस पैकेट बचे हैं। यह बफर स्टॉक से कम है, कृपया नया खरीद ऑर्डर जारी करें।`,
    voiceText:  'प्राथमिक स्वास्थ्य केंद्र अलंदूर में १५ ओआरएस पैकेट बचे हैं। यह बफर स्टॉक से कम है, कृपया नया खरीद ऑर्डर जारी करें।',
    langCode:   'hi-IN',
  },
  {
    lang:       'Tamil',
    text:       'பாராசிட்டமால் மாத்திரைகள் எவ்வளவு உள்ளது? (How much Paracetamol?)',
    transcript: 'Paracetamol stock level at PHC Alandur',
    response:   `┌─────────────────────────────────────────────┐\n│ 🔴 STOCK CRITICAL                           │\n│ Center: PHC Alandur | Block: St. Thomas Mou │\n│ Medicine: Paracetamol 500mg | Current: 8 un │\n│ Buffer needed: 100 units                    │\n│ Days to stock-out: 0.8 days                 │\n│ Action: Transfer 92 units from CHC Tambaram │\n└─────────────────────────────────────────────┘\n\n[Voice output - Tamil]: அலந்தூர் மையத்தில் பாராசிட்டமால் இருப்பு மிகக் குறைவாக உள்ளது (8 மாத்திரைகள்). தாம்பரம் மையத்தில் இருந்து மாற்றுவதற்கு பரிந்துரைக்கப்படுகிறது.`,
    voiceText:  'அலந்தூர் மையத்தில் பாராசிட்டமால் இருப்பு மிகக் குறைவாக உள்ளது. தாம்பரம் மையத்தில் இருந்து மாற்றுவதற்கு பரிந்துரைக்கப்படுகிறது.',
    langCode:   'ta-IN',
  },
  {
    lang:       'Telugu',
    text:       'ఇక్కడ ఎన్ని బెడ్లు ఖాళీగా ఉన్నాయి? (How many free beds here?)',
    transcript: 'Bed capacity status at CHC Tambaram',
    response:   `┌─────────────────────────────────────────────┐\n│ 🟡 BEDS UNDERUTILIZATION AUDIT              │\n│ Center: CHC Tambaram | Block: Tambaram      │\n│ Occupancy: <30% for 7 consecutive days      │\n│ Status: UNDERUTILIZED                       │\n│ Action: Flag for resources audit            │\n└─────────────────────────────────────────────┘\n\n[Voice output - Telugu]: తాంబరం సామాజిక ఆరోగ్య కేంద్రంలో ప్రస్తుతం ఇరవై ఐదు బెడ్లు ఖాళీగా ఉన్నాయి. వినియోగం గత వారం నుండి ముప్పై శాతం కంటే తక్కువగా ఉంది.`,
    voiceText:  'తాంబరం సామాజిక ఆరోగ్య కేంద్రంలో ప్రస్తుతం ఇరవై ఐదు బెడ్లు ఖాళీగా ఉన్నాయి. వినియోగం గత వారం నుండి ముప్పై శాతం కంటే తక్కువగా ఉంది.',
    langCode:   'te-IN',
  },
];

/**
 * Speaks a localised response string using the Web Speech Synthesis API.
 *
 * @param {string} text     - Text to synthesise
 * @param {string} langCode - BCP-47 language tag (e.g. 'hi-IN')
 */
function speakResponse(text, langCode) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;

  const setVoiceAndSpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const primaryLang = langCode.split('-')[0].toLowerCase();
    
    // 1. Try to find a Google voice first for the exact langCode
    let match = voices.find(v => v.lang.replace('_', '-').startsWith(langCode) && v.name.includes('Google'));
    // 2. Try any voice for the exact langCode
    if (!match) match = voices.find(v => v.lang.replace('_', '-').startsWith(langCode));
    // 3. Fallback to just matching the primary language ('ta', 'te', etc.)
    if (!match) match = voices.find(v => v.lang.toLowerCase().startsWith(primaryLang));
    
    if (match) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  };

  // Chrome sometimes loads voices asynchronously
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = setVoiceAndSpeak;
  } else {
    setVoiceAndSpeak();
  }
}

/**
 * @param {object}   props
 * @param {object}   props.centers
 * @param {string}   props.activeCenterId       - Resolved centre ID for this view
 * @param {string}   props.medSelect
 * @param {Function} props.setMedSelect
 * @param {string}   props.stockInput
 * @param {Function} props.setStockInput
 * @param {boolean}  props.isRecording
 * @param {Function} props.setIsRecording
 * @param {object|null} props.voiceResponse
 * @param {Function} props.setVoiceResponse
 * @param {Function} props.updateStockLevel
 */
function FieldWorkerView({
  centers,
  activeCenterId,
  medSelect,
  setMedSelect,
  stockInput,
  setStockInput,
  isRecording,
  setIsRecording,
  voiceResponse,
  setVoiceResponse,
  updateStockLevel,
}) {
  const center       = centers[activeCenterId];
  const stockEntries = Object.entries(center?.stocks || {});
  const medOptions   = stockEntries.map(([medId, med]) => ({ value: medId, label: med.name }));

  /** Handle a simulated voice query by index. */
  const handleVoiceQuery = index => {
    setIsRecording(true);
    setVoiceResponse(null);

    setTimeout(() => {
      setIsRecording(false);
      const sample = VOICE_SAMPLE_QUERIES[index];
      setVoiceResponse(sample);
      speakResponse(sample.voiceText, sample.langCode);
    }, 1800);
  };

  /** Submit a manual stock log entry. */
  const handleStockSync = () => {
    if (stockInput.trim() === '') return;
    updateStockLevel(activeCenterId, medSelect, stockInput);
    setStockInput('');
    alert('Stock updated successfully! Data synchronized.');
  };

  return (
    <div className="field-worker-grid">

      {/* ── Manual Log Entry ── */}
      <div className="glass-panel">
        <h3 className="panel-title">✍️ Manual Log Entry</h3>

        <div className="form-group" style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', marginBottom: '6px' }}>Select Register Item</label>
          <CustomDropdown
            value={medSelect}
            onChange={val => setMedSelect(val)}
            options={medOptions}
            width="100%"
          />
        </div>

        <div className="form-group">
          <label>Current Quantity (Units)</label>
          <input
            type="number"
            placeholder="Enter stock amount..."
            value={stockInput}
            onChange={e => setStockInput(e.target.value)}
            style={{ background: '#0e1320', color: 'white', border: '1px solid var(--border-glass)' }}
          />
        </div>

        <button className="btn-submit" onClick={handleStockSync} style={{ border: 'none', cursor: 'pointer' }}>
          Sync Log Entry
        </button>
      </div>

      {/* ── Multilingual Voice Interface ── */}
      <div className="glass-panel">
        <h3 className="panel-title">🎙️ Multilingual Voice Interface</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Speak in your language. Speech-to-Text translates, processes query with Gemini, and outputs formatted charts and synthesized audio read-back.
        </p>

        {/* Mic button */}
        <div className="voice-section">
          <button
            className={`mic-btn ${isRecording ? 'recording' : ''}`}
            disabled={isRecording}
            onClick={() => { setIsRecording(true); setTimeout(() => setIsRecording(false), 1500); }}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            🎤
          </button>
          <span className="voice-status">
            {isRecording ? 'Transcribing Tamil/Hindi/Telugu/English...' : 'Select a sample voice input below to simulate:'}
          </span>
        </div>

        {/* Sample query buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {VOICE_SAMPLE_QUERIES.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleVoiceQuery(idx)}
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', padding: '10px 14px', borderRadius: '6px', textAlign: 'left', color: 'white', cursor: 'pointer', fontSize: '12px' }}
            >
              <strong style={{ color: 'var(--neon-blue)' }}>[{q.lang}]:</strong> {q.text}
            </button>
          ))}
        </div>

        {/* Voice response card */}
        {voiceResponse && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <strong>STT Transcript:</strong> "{voiceResponse.transcript}"
            </div>
            <pre className="voice-response-box" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '11px' }}>
              {voiceResponse.response}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default FieldWorkerView;
