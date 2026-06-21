'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SavingStatusPortal() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const tick = () => {
      const row = document.querySelector('main div.mt-2.flex.items-center.justify-center.gap-2') as HTMLElement | null;
      if (row) {
        let host = document.getElementById('pt-saving-status-slot') as HTMLElement | null;
        if (!host) {
          host = document.createElement('span');
          host.id = 'pt-saving-status-slot';
          host.style.display = 'inline-flex';
          host.style.alignItems = 'center';
          host.style.minWidth = '0';
          row.appendChild(host);
        }
        setSlot(host);
      }

      const floatingSaving = Array.from(document.querySelectorAll('p.animate-pulse'))
        .filter(node => node.textContent?.trim() === 'Saving…') as HTMLElement[];
      floatingSaving.forEach(node => {
        node.style.display = 'none';
      });
      setIsSaving(floatingSaving.length > 0);
    };

    tick();
    const observer = new MutationObserver(tick);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const id = window.setInterval(tick, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(id);
    };
  }, []);

  if (!slot || !isSaving) return null;

  return createPortal(
    <span
      className="text-[10px] font-bold px-2 py-1 rounded-full animate-pulse"
      style={{ color: '#7E9B86', background: '#E4ECE6' }}
    >
      Saving…
    </span>,
    slot,
  );
}
