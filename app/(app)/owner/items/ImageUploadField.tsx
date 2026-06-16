'use client';

import { useState } from 'react';

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
  const [previewSrc, setPreviewSrc] = useState(initialSrc);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
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
        setPreviewSrc(canvas.toDataURL('image/webp', 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <label>
      {!compact ? label : <span className="sr-only">{label}</span>}
      <input type="file" accept="image/*" onChange={handleChange} disabled={disabled} aria-label={label} data-upload-name={uploadName} />
      <input name={name} type="hidden" value={previewSrc} form={form} readOnly />
      {previewSrc ? <img className="item-thumb" src={previewSrc} alt="Selected product preview" /> : null}
    </label>
  );
}
