export interface PosterData {
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  imageUrl: string | null;
}

export interface PosterTemplate {
  key: string;
  name: string;
  description: string;
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  { key: 'bold-center', name: 'Bold Center', description: 'Gradient background, centered headline' },
  { key: 'side-banner', name: 'Side Banner', description: 'Color block with image on one side' },
  { key: 'minimal-frame', name: 'Minimal Frame', description: 'Clean bordered layout' },
  { key: 'gradient-burst', name: 'Gradient Burst', description: 'Diagonal gradient, bottom-aligned text' },
  { key: 'image-overlay', name: 'Image Overlay', description: 'Full background photo with text overlay' },
  { key: 'two-tone', name: 'Two Tone', description: 'Split color blocks' },
];

/**
 * Renders a poster at a fixed 600x800 size (3:4 ratio) so html2canvas
 * captures a consistent, print-friendly image regardless of viewport.
 */
export function PosterPreview({ template, data }: { template: string; data: PosterData }) {
  const { title, subtitle, primaryColor, secondaryColor, imageUrl } = data;

  const base = 'w-[300px] h-[400px] relative overflow-hidden flex flex-col font-sans select-none';

  switch (template) {
    case 'ai-generated':
      return (
        <div className={base} style={{ background: imageUrl ? `url(${imageUrl}) center/cover` : '#e5e7eb' }}>
          {!imageUrl && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Generating...</div>
          )}
        </div>
      );
    case 'side-banner':
      return (
        <div className={base} style={{ background: '#fff' }}>
          <div className="w-2/5 h-full absolute left-0 top-0 flex flex-col justify-center p-6" style={{ background: primaryColor }}>
            <h2 className="text-white font-bold text-xl leading-tight break-words">{title || 'Your Title'}</h2>
            {subtitle && <p className="text-white/80 text-xs mt-2 break-words">{subtitle}</p>}
          </div>
          <div className="absolute right-0 top-0 w-3/5 h-full" style={{ background: imageUrl ? `url(${imageUrl}) center/cover` : secondaryColor }} />
        </div>
      );
    case 'minimal-frame':
      return (
        <div className={base} style={{ background: '#fafafa', border: `8px solid ${primaryColor}` }}>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="font-bold text-2xl leading-tight break-words" style={{ color: primaryColor }}>{title || 'Your Title'}</h2>
            {subtitle && <p className="text-gray-500 text-sm mt-3 break-words">{subtitle}</p>}
          </div>
        </div>
      );
    case 'gradient-burst':
      return (
        <div className={base} style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
          <div className="flex-1" />
          <div className="p-6 pb-10">
            <h2 className="text-white font-extrabold text-3xl leading-tight break-words">{title || 'Your Title'}</h2>
            {subtitle && <p className="text-white/90 text-sm mt-2 break-words">{subtitle}</p>}
          </div>
        </div>
      );
    case 'image-overlay':
      return (
        <div className={base} style={{ background: imageUrl ? `url(${imageUrl}) center/cover` : `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
          <div className="flex-1" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0) 50%)' }} />
          <div className="p-6 pb-10 absolute bottom-0 left-0 right-0">
            <h2 className="text-white font-extrabold text-2xl leading-tight break-words drop-shadow">{title || 'Your Title'}</h2>
            {subtitle && <p className="text-white/90 text-sm mt-2 break-words drop-shadow">{subtitle}</p>}
          </div>
        </div>
      );
    case 'two-tone':
      return (
        <div className={base}>
          <div className="h-1/2 flex items-end p-6" style={{ background: primaryColor }}>
            <h2 className="text-white font-bold text-2xl leading-tight break-words">{title || 'Your Title'}</h2>
          </div>
          <div className="h-1/2 flex items-start p-6" style={{ background: secondaryColor }}>
            {subtitle && <p className="text-white/90 text-sm break-words">{subtitle}</p>}
          </div>
        </div>
      );
    case 'bold-center':
    default:
      return (
        <div className={base} style={{ background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})` }}>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-white font-extrabold text-3xl leading-tight break-words">{title || 'Your Title'}</h2>
            {subtitle && <p className="text-white/85 text-sm mt-3 break-words">{subtitle}</p>}
          </div>
        </div>
      );
  }
}
