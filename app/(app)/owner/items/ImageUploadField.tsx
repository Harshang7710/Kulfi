'use client';

import { useRef, useState } from 'react';

export default function ImageUploadField() {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState('');

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
      Product image (optional)
      <input name="imageUpload" type="file" accept="image/*" onChange={handleChange} />
      <input ref={hiddenRef} name="imageData" type="hidden" />
      {previewSrc ? <img className="item-thumb" src={previewSrc} alt="Selected product preview" /> : null}
    </label>
  );
}
