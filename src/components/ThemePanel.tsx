import React, { useRef } from 'react';
import { useStore } from '../store';

const PRESET_THEMES = [
  // Default
  { id: 'cosmos-light', name: 'Cosmos Light', bg: '#F9F9F9', text: '#1C1C1C', accent: '#E0E0E0', font: 'Inter, sans-serif' },

  // Original / Classic
  { id: 'wireframe', name: 'Wireframe Brutalist', bg: '#FFFFFF', text: '#000000', accent: '#0000FF', font: 'Space Mono, monospace' },
  { id: 'archival', name: 'Archival Paper', bg: '#FDFBF7', text: '#1A1A1A', accent: '#8B0000', font: 'Playfair Display, serif' },
  { id: 'y2k', name: 'Y2K Terminal', bg: '#0A0A0A', text: '#39FF14', accent: '#FF007F', font: 'VT323, monospace' },
  { id: 'ethereal', name: 'Ethereal Glass', bg: '#E6E6FA', text: '#2F4F4F', accent: '#FFDAB9', font: 'Inter, sans-serif' },
  { id: 'midnight', name: 'Midnight Moss', bg: '#0F1F15', text: '#B5C6B5', accent: '#E5DBCF', font: 'Playfair Display, serif' },

  // Clean / Minimal
  { id: 'linear', name: 'Linear Dark', bg: '#0A0A0A', text: '#EEEEEE', accent: '#5E6AD2', font: 'Inter, sans-serif' },
  { id: 'vercel', name: 'Vercel Light', bg: '#FFFFFF', text: '#111111', accent: '#0070F3', font: 'Inter, sans-serif' },
  { id: 'raycast', name: 'Raycast Sunset', bg: '#FFECE4', text: '#3F2A21', accent: '#FF6B4A', font: 'Inter, sans-serif' },
  { id: 'tokyo', name: 'Tokyo Night', bg: '#1A1B26', text: '#A9B1D6', accent: '#7AA2F7', font: 'Space Mono, monospace' },
  { id: 'nord', name: 'Nord Minimal', bg: '#2E3440', text: '#ECEFF4', accent: '#88C0D0', font: 'Inter, sans-serif' },

  // Avant-Garde
  { id: 'acid', name: 'Acid Brutalism', bg: '#CCFF00', text: '#111111', accent: '#FF00FF', font: 'Space Mono, monospace' },
  { id: 'clay', name: 'Claymorphism', bg: '#E0E5EC', text: '#4A5568', accent: '#F56565', font: 'Inter, sans-serif' },
  { id: 'aura', name: 'Aura Flow', bg: '#FFD1FF', text: '#3A0088', accent: '#00F0FF', font: 'Playfair Display, serif' },
  { id: 'solar', name: 'Solar Punk', bg: '#FFF6D9', text: '#0B4619', accent: '#F27A1A', font: 'Inter, sans-serif' },
  { id: 'matrix', name: 'Hacker Matrix', bg: '#000000', text: '#00FF41', accent: '#FFFFFF', font: 'VT323, monospace' },
];

interface ThemePanelProps {
  visible: boolean;
  onExportPDF: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
}

const ThemePanel: React.FC<ThemePanelProps> = ({ visible, onExportPDF, showGrid, onToggleGrid }) => {
  const { theme, setTheme, cachedItems, setCachedItems } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyTheme = (newTheme: typeof theme) => {
    // Update all existing text items that used the old theme color to the new one
    setCachedItems(cachedItems.map(item => 
      item.type === 'text' && item.color === theme.textColor
        ? { ...item, color: newTheme.textColor, fontFamily: item.fontFamily === theme.fontFamily ? newTheme.fontFamily : item.fontFamily }
        : item
    ));
    setTheme(newTheme);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 40) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);

      const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      const avgHex = rgbToHex(r, g, b);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const isLight = luminance > 0.5;
      const contrastHex = isLight ? '#121212' : '#FAFAFA';
      const accentHex = isLight ? '#E0E0E0' : '#2A2A2A';

      applyTheme({ ...theme, id: 'ai-generated', name: 'AI Generated', backgroundColor: avgHex, textColor: contrastHex, accentColor: accentHex });
      URL.revokeObjectURL(objectUrl);
    };
  };

  return (
    <div style={{
      position: 'absolute',
      top: 80,
      right: '50%',
      transform: `translateX(50%) ${visible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.96)'}`,
      zIndex: 10,
      width: 300,
      padding: '24px',
      border: `1px solid ${theme.textColor}15`,
      backgroundColor: `${theme.backgroundColor}F2`,
      backdropFilter: 'blur(32px)',
      WebkitBackdropFilter: 'blur(32px)',
      borderRadius: '24px',
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      boxShadow: `0 32px 64px -16px ${theme.textColor}30`,
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Canvas</span>

        <button onClick={onToggleGrid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: `${theme.textColor}0A`, borderRadius: '12px', border: `1px solid ${theme.textColor}10`, cursor: 'pointer', color: theme.textColor, fontFamily: theme.fontFamily, transition: 'all 0.2s' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Page Grid</span>
          <div style={{ width: '36px', height: '20px', borderRadius: '20px', backgroundColor: showGrid ? theme.textColor : `${theme.textColor}30`, position: 'relative', transition: 'all 0.2s' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: theme.backgroundColor, position: 'absolute', top: '2px', left: showGrid ? '18px' : '2px', transition: 'all 0.2s' }} />
          </div>
        </button>

        <button onClick={onExportPDF} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px', backgroundColor: `${theme.textColor}0A`, borderRadius: '12px', border: `1px solid ${theme.textColor}10`, cursor: 'pointer', color: theme.textColor, fontFamily: theme.fontFamily, fontWeight: 500, fontSize: '13px', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = `${theme.textColor}15`} onMouseOut={(e) => e.currentTarget.style.backgroundColor = `${theme.textColor}0A`}>
          Export Board to PDF
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Appearance</span>

        {/* Controlled select - shows current theme */}
        <select
          value={theme.id}
          onChange={(e) => {
            const t = PRESET_THEMES.find(p => p.id === e.target.value);
            if (t) applyTheme({ id: t.id, name: t.name, backgroundColor: t.bg, textColor: t.text, accentColor: t.accent, fontFamily: t.font });
          }}
          style={{ width: '100%', padding: '10px 12px', backgroundColor: `${theme.backgroundColor}80`, color: theme.textColor, border: `1px solid ${theme.textColor}15`, borderRadius: '12px', cursor: 'pointer', outline: 'none', fontFamily: theme.fontFamily, fontSize: '13px' }}
        >
          {!PRESET_THEMES.find(p => p.id === theme.id) && (
            <option value={theme.id}>{theme.name}</option>
          )}
          {PRESET_THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', backgroundColor: `${theme.textColor}05`, borderRadius: '16px', border: `1px solid ${theme.textColor}0A` }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Background</span>
            <input type="color" value={theme.backgroundColor} onChange={(e) => applyTheme({ ...theme, backgroundColor: e.target.value })} style={{ width: '28px', height: '28px', border: 'none', padding: 0, cursor: 'pointer', backgroundColor: 'transparent' }} />
          </label>

          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Ink Color</span>
            <input type="color" value={theme.textColor} onChange={(e) => applyTheme({ ...theme, textColor: e.target.value })} style={{ width: '28px', height: '28px', border: 'none', padding: 0, cursor: 'pointer', backgroundColor: 'transparent' }} />
          </label>
        </div>

        <select
          value={theme.fontFamily}
          onChange={(e) => applyTheme({ ...theme, fontFamily: e.target.value })}
          style={{ width: '100%', padding: '10px 12px', backgroundColor: `${theme.backgroundColor}80`, color: theme.textColor, border: `1px solid ${theme.textColor}15`, borderRadius: '12px', cursor: 'pointer', outline: 'none', fontFamily: theme.fontFamily, fontSize: '13px' }}
        >
          <option value="Space Mono, monospace">Space Mono</option>
          <option value="Inter, sans-serif">Inter</option>
          <option value="Playfair Display, serif">Playfair Display</option>
          <option value="VT323, monospace">VT323 (Y2K)</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>AI Color Match</span>
        <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%', padding: '12px', backgroundColor: theme.textColor, color: theme.backgroundColor, border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', transition: 'all 0.2s ease', fontFamily: theme.fontFamily }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Extract from Image
        </button>
      </div>
    </div>
  );
};

export default ThemePanel;
