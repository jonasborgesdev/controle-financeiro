import { Button } from "@/components/ui/button";

type ModalProps = {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function Modal({ title, description, open, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/75 p-0 backdrop-blur-md sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="Fechar" onClick={onClose} />
      <div className="finance-glass-strong safe-pb relative max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] p-5 text-slate-50 sm:max-w-2xl sm:rounded-[2rem] sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-xl font-bold tracking-[-0.03em] text-slate-50">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
          </div>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
