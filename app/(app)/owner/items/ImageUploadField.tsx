'use client';

import { useRef, useState } from 'react';

type ImageUploadFieldProps = {
  name?: string;
  uploadName?: string;
  initialSrc?: string;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  form?: string;
};

export default function ImageUploadField({
  name = 'imageData',
  uploadName = 'imageUpload',
  initialSrc = '',
  disabled = false,
  label = 'Product image (optional)',
  compact = false,
  form
}: ImageUploadFieldProps = {}) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState(initialSrc);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const hidden = hiddenRef.current;
    if (!file || !hidden) {
      if (hidden) hidden.value = '';
      setPreviewSrc('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', 0.78);
        hidden.value = dataUrl;
        setPreviewSrc(dataUrl);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <label>
      {!compact ? label : <span className="sr-only">{label}</span>}
      <input name={uploadName} type="file" accept="image/*" onChange={handleChange} disabled={disabled} aria-label={label} />
      <input ref={hiddenRef} name={name} type="hidden" defaultValue={initialSrc} form={form} />
      {previewSrc ? <img className="item-thumb" src={previewSrc} alt="Selected product preview" /> : '—'}
    </label>
  );
}
