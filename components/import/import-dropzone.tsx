"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

const ACCEPTED = ".csv,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg";

export function ImportDropzone({ onFilesSelected, disabled }: { onFilesSelected: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(event.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`sticker-card-dashed flex flex-col items-center gap-2 p-8 text-center transition-colors ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${isDragging ? "border-accent bg-accent-soft" : ""}`}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-sm font-bold">Dépose ton fichier ici, ou clique pour parcourir</p>
        <p className="text-xs text-muted-foreground">
          Exports CSV de tes outils, Excel, PDF de relevé, ou même une capture d&apos;écran
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          disabled={disabled}
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Ton fichier est analysé par le modèle IA connecté à ton compte (ta clé), jamais stocké.
      </p>
    </div>
  );
}
