import React, { useRef } from 'react';
import { useStore } from '../store';

  const PRESET_THEMES = [
    { id: 'cosmos-light', name: 'Cosmos Light', bg: '#F9F9F9', text: '#1C1C1C', accent: '#E0E0E0', font: 'Inter, sans-serif' },
    { id: 'porcelain', name: 'Porcelain White', bg: '#FFFFFF', text: '#141414', accent: '#D9D9D9', font: 'Inter, sans-serif' },
    { id: 'sunflare', name: 'Sunflare Orange', bg: '#FFF4E8', text: '#2A1708', accent: '#FF8A2A', font: 'Inter, sans-serif' },
    { id: 'wireframe', name: 'Wireframe Brutalist', bg: '#FFFFFF', text: '#000000', accent: '#0000FF', font: 'Space Mono, monospace' },
    { id: 'archival', name: 'Archival Paper', bg: '#FDFBF7', text: '#1A1A1A', accent: '#8B0000', font: 'Playfair Display, serif' },
    { id: 'y2k', name: 'Y2K Terminal', bg: '#0A0A0A', text: '#39FF14', accent: '#FF007F', font: 'VT323, monospace' },
    { id: 'ethereal', name: 'Ethereal Glass', bg: '#E6E6FA', text: '#2F4F4F', accent: '#FFDAB9', font: 'Inter, sans-serif' },
    { id: 'midnight', name: 'Midnight Moss', bg: '#0F1F15', text: '#B5C6B5', accent: '#E5DBCF', font: 'Playfair Display, serif' },
    { id: 'linear', name: 'Linear Dark', bg: '#0A0A0A', text: '#EEEEEE', accent: '#5E6AD2', font: 'Inter, sans-serif' },
    { id: 'vercel', name: 'Vercel Light', bg: '#FFFFFF', text: '#111111', accent: '#0070F3', font: 'Inter, sans-serif' },
    { id: 'raycast', name: 'Raycast Sunset', bg: '#FFECE4', text: '#3F2A21', accent: '#FF6B4A', font: 'Inter, sans-serif' },
    { id: 'tokyo', name: 'Tokyo Night', bg: '#1A1B26', text: '#A9B1D6', accent: '#7AA2F7', font: 'Space Mono, monospace' },
    { id: 'nord', name: 'Nord Minimal', bg: '#2E3440', text: '#ECEFF4', accent: '#88C0D0', font: 'Inter, sans-serif' },
    { id: 'acid', name: 'Acid Brutalism', bg: '#CCFF00', text: '#111111', accent: '#FF00FF', font: 'Space Mono, monospace' },
    { id: 'clay', name: 'Claymorphism', bg: '#E0E5EC', text: '#4A5568', accent: '#F56565', font: 'Inter, sans-serif' },
    { id: 'aura', name: 'Aura Flow', bg: '#FFD1FF', text: '#3A0088', accent: '#00F0FF', font: 'Playfair Display, serif' },
    { id: 'solar', name: 'Solar Punk', bg: '#FFF6D9', text: '#0B4619', accent: '#F27A1A', font: 'Inter, sans-serif' },
    { id: 'matrix', name: 'Hacker Matrix', bg: '#000000', text: '#00FF41', accent: '#FFFFFF', font: 'VT323, monospace' },
    { id: 'inkwell', name: 'Inkwell', bg: '#F3F0EA', text: '#1F1A17', accent: '#8C5A3C', font: 'Playfair Display, serif' },
    { id: 'citrus', name: 'Citrus Pop', bg: '#FFF9E8', text: '#2F2100', accent: '#FF9F1C', font: 'Inter, sans-serif' },
    { id: 'reef', name: 'Reef Aqua', bg: '#E9FFFB', text: '#083339', accent: '#19B6B3', font: 'Inter, sans-serif' },
    { id: 'plum', name: 'Plum Velvet', bg: '#1D1028', text: '#F6E9FF', accent: '#B86BFF', font: 'Inter, sans-serif' },
    { id: 'graphite', name: 'Graphite Glow', bg: '#141414', text: '#F3F3F3', accent: '#FF6A00', font: 'Space Mono, monospace' },
    { id: 'blossom', name: 'Blossom Mist', bg: '#FFF1F6', text: '#4A1E2D', accent: '#FF7FA2', font: 'Inter, sans-serif' },
    { id: 'oasis', name: 'Oasis Blue', bg: '#EAF6FF', text: '#12324A', accent: '#2E86DE', font: 'Inter, sans-serif' },
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

    const getReadableTextColor = (backgroundColor: string) => {
      const hex = backgroundColor.replace('#', '');
      const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
      const red = parseInt(normalized.slice(0, 2), 16);
      const green = parseInt(normalized.slice(2, 4), 16);
      const blue = parseInt(normalized.slice(4, 6), 16);
      const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
      return luminance > 0.65 ? '#1A1A1A' : '#F7F7F7';
    };

    const applyTheme = (newTheme: typeof theme) => {
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
        let r = 0;
        let g = 0;
        let b = 0;
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

        const rgbToHex = (red: number, green: number, blue: number) => '#' + [red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('');
        const avgHex = rgbToHex(r, g, b);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const isLight = luminance > 0.5;
        const contrastHex = isLight ? '#121212' : '#FAFAFA';
        const accentHex = isLight ? '#E0E0E0' : '#2A2A2A';

        applyTheme({ ...theme, id: 'ai-generated', name: 'AI Generated', backgroundColor: avgHex, textColor: contrastHex, accentColor: accentHex });
        URL.revokeObjectURL(objectUrl);
      };
    };

    const panelStyle: React.CSSProperties = {
      position: 'absolute',
      top: 80,
      right: '50%',
      transform: `translateX(50%) ${visible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.96)'}`,
      zIndex: 10,
      width: 360,
      padding: '14px',
      border: `1px solid ${theme.textColor}15`,
      background: `linear-gradient(180deg, ${theme.backgroundColor}F6 0%, ${theme.backgroundColor}EC 100%)`,
      backdropFilter: 'blur(32px)',
      WebkitBackdropFilter: 'blur(32px)',
      borderRadius: '24px',
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      boxShadow: `0 28px 56px -18px ${theme.textColor}2C, 0 1px 0 ${theme.textColor}10 inset`,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      maxHeight: '86vh',
      overflowY: 'auto'
    };

    const themeCardBase: React.CSSProperties = {
      width: '100%',
      minHeight: '40px',
      borderRadius: '999px',
      border: '1px solid transparent',
      padding: '7px 10px',
      cursor: 'pointer',
      textAlign: 'left',
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '10px',
      transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease',
      position: 'relative',
      overflow: 'hidden',
    };

    const swatchStyle = (color: string): React.CSSProperties => ({
      width: '12px',
      height: '12px',
      borderRadius: '999px',
      backgroundColor: color,
      boxShadow: '0 0 0 1px rgba(255,255,255,0.45) inset',
      flexShrink: 0,
    });

    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Canvas</span>

          <button onClick={onToggleGrid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: `${theme.textColor}08`, borderRadius: '999px', border: `1px solid ${theme.textColor}10`, cursor: 'pointer', color: theme.textColor, fontFamily: theme.fontFamily, transition: 'all 0.2s' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Page Grid</span>
            <div style={{ width: '34px', height: '18px', borderRadius: '999px', backgroundColor: showGrid ? theme.textColor : `${theme.textColor}28`, position: 'relative', transition: 'all 0.2s' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: theme.backgroundColor, position: 'absolute', top: '2px', left: showGrid ? '18px' : '2px', transition: 'all 0.2s' }} />
            </div>
          </button>

          <button onClick={onExportPDF} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 12px', backgroundColor: `${theme.textColor}08`, borderRadius: '999px', border: `1px solid ${theme.textColor}10`, cursor: 'pointer', color: theme.textColor, fontFamily: theme.fontFamily, fontWeight: 700, fontSize: '12px', letterSpacing: '0.2px', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = `${theme.textColor}12`} onMouseOut={(e) => e.currentTarget.style.backgroundColor = `${theme.textColor}08`}>
            Export Board to PDF
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>AI Color Match</span>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: `${theme.textColor}08`, color: theme.textColor, border: `1px solid ${theme.textColor}10`, borderRadius: '999px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', letterSpacing: '0.2px', transition: 'all 0.2s ease', fontFamily: theme.fontFamily }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = `${theme.textColor}12`}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = `${theme.textColor}08`}
          >
            Extract from Image
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Appearance</span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', maxHeight: '336px', overflowY: 'auto', paddingRight: '4px', scrollbarGutter: 'stable' }}>
            {PRESET_THEMES.map((preset) => {
              const active = theme.id === preset.id;
              const readableText = getReadableTextColor(preset.bg);
              const cardShadow = active ? `0 14px 24px -18px ${preset.accent}B0` : '0 8px 16px -16px rgba(0,0,0,0.28)';

              return (
                <button
                  key={preset.id}
                  onClick={() => applyTheme({ id: preset.id, name: preset.name, backgroundColor: preset.bg, textColor: preset.text, accentColor: preset.accent, fontFamily: preset.font })}
                  style={{
                    ...themeCardBase,
                    background: active ? `${preset.bg}F8` : `${preset.bg}EE`,
                    borderColor: active ? preset.accent : `${preset.text}18`,
                    boxShadow: cardShadow,
                    transform: active ? 'translateY(-1px)' : 'translateY(0)',
                    opacity: visible ? 1 : 0.98,
                    color: readableText,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = active ? 'translateY(-1px)' : 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, position: 'relative', zIndex: 1 }}>
                    <div style={swatchStyle(preset.bg)} />
                    <div style={swatchStyle(preset.text)} />
                    <div style={swatchStyle(preset.accent)} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, color: 'inherit' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.name}</span>
                      <span style={{ fontSize: '10px', opacity: 0.56, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.font.split(',')[0]}</span>
                    </div>
                    {active && (
                      <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '999px', backgroundColor: `${preset.text}10`, border: `1px solid ${preset.text}18`, color: 'inherit' }}>
                        Active
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', backgroundColor: `${theme.textColor}05`, borderRadius: '16px', border: `1px solid ${theme.textColor}0A` }}>
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
            style={{ width: '100%', padding: '10px 12px', backgroundColor: `${theme.backgroundColor}80`, color: theme.textColor, border: `1px solid ${theme.textColor}15`, borderRadius: '999px', cursor: 'pointer', outline: 'none', fontFamily: theme.fontFamily, fontSize: '13px' }}
          >
            <option value="Space Mono, monospace">Space Mono</option>
            <option value="Inter, sans-serif">Inter</option>
            <option value="Playfair Display, serif">Playfair Display</option>
            <option value="VT323, monospace">VT323 (Y2K)</option>
          </select>
        </div>
      </div>
    );
  };

  export default ThemePanel;
