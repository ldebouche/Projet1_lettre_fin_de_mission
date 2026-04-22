import { Component, ElementRef, EventEmitter, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../../../shared/modal/modal';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import Quill from 'quill';
import { ChatbotSettingsService } from '../../../../../services/chatbot-settings-service';

@Component({
  selector: 'app-edit-procedure',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent
  ],
  templateUrl: './edit-procedure.html',
  styleUrls: ['./edit-procedure.scss']
})
export class EditProcedureComponent {
  @Input() open = false;
  @Input() title = 'Modifier la procédure';
  @Input() docName = '';
  @Input() docSource = '';
  @Input() loading = false;

  @Input() html = '';

  @Input() folderName = 'attente';
  @Input() procedureName = '';
  @Output() textChange = new EventEmitter<string>();

  @Output() save = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('quillHost') quillHost!: ElementRef<HTMLDivElement>;

  private quill: Quill | null = null;
  private isReady = false;

  tab: 'edit' | 'preview' = 'edit';

  draft = '';

  toolbar: any;

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastSnapshot = '';

  constructor(
    private sanitizer: DomSanitizer,
    private chatbotSettingsService: ChatbotSettingsService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      queueMicrotask(() => this.initEditor());
    }

    // ✅ fermeture : détruire proprement
    if (changes['open']?.currentValue === false) {
      this.destroyEditor();
    }

    // ✅ si le parent change le HTML pendant que c’est ouvert (ex: retour Mistral)
    if (changes['html'] && this.open && this.quill) {
      this.quill.clipboard.dangerouslyPasteHTML(this.html || '');
      this.quill.setSelection(0, 0, 'silent');
    }
  }

  private initEditor() {
    const host = this.quillHost?.nativeElement;
    if (!host) return;

    // si une ancienne instance traîne (sécurité)
    this.destroyEditor();

    this.quill = new Quill(host, {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image'],
          ['clean'],
        ],
      },
    });

    this.toolbar = this.quill.getModule('toolbar');
    this.toolbar.addHandler('image', () => this.pickAndUploadImage());

    this.quill.clipboard.dangerouslyPasteHTML(this.html || '');
    this.quill.setSelection(0, 0, 'silent'); // ✅ évite addRange
  }

  private destroyEditor() {
    if (!this.quill) return;

    // Quill n’a pas de destroy officiel, on nettoie le DOM et on lâche la ref
    const host = this.quillHost?.nativeElement;
    if (host) host.innerHTML = '';

    this.quill = null;
  }

  private pickAndUploadImage() {
    if (!this.quill) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.click();

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      // upload
      this.chatbotSettingsService.UploadProcedureImage(this.folderName, this.procedureName, file)
        .subscribe((res: any) => {
          const name = res?.name;
          const url = res?.url;
          if (!name || !url) return;

          const range = this.quill!.getSelection(true) || { index: this.quill!.getLength(), length: 0 };

          const html = `
          <div class="img-bloc">
            <img src="${url}" data-asset="${name}" alt="${name}" />
          </div>
        `;

          this.quill!.clipboard.dangerouslyPasteHTML(range.index, html);
          this.quill!.setSelection(range.index + 1, 0, 'silent');
        });
    };
  }

  close() {
    this.cancel.emit();
  }

  confirm() {
    const htmlOut = this.quill?.root.innerHTML || '';
    this.save.emit(htmlOut);
  }

  onInput() {
    if (this.draft !== this.lastSnapshot) {
      this.undoStack.push(this.lastSnapshot);
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.lastSnapshot = this.draft;
      this.redoStack = [];
    }
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.draft);
    this.draft = this.undoStack.pop()!;
    this.lastSnapshot = this.draft;
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.draft);
    this.draft = this.redoStack.pop()!;
    this.lastSnapshot = this.draft;
  }

  //private withTextarea(fn: (ta: HTMLTextAreaElement) => void) {
  //  const ta = this.editorArea?.nativeElement;
  //  if (!ta) return;
  //  ta.focus();
  //  fn(ta);
  //}

  //wrapSelection(before: string, after: string) {
  //  this.withTextarea((ta) => {
  //    const start = ta.selectionStart ?? 0;
  //    const end = ta.selectionEnd ?? 0;
  //    const selected = this.draft.slice(start, end) || 'texte';
  //
  //    this.draft =
  //      this.draft.slice(0, start) +
  //      before + selected + after +
  //      this.draft.slice(end);
  //
  //    this.onInput();
  //
  //    const s = start + before.length;
  //    const e = s + selected.length;
  //    requestAnimationFrame(() => ta.setSelectionRange(s, e));
  //  });
  //}
  //
  //insertHeading() {
  //  this.withTextarea((ta) => {
  //    const start = ta.selectionStart ?? 0;
  //    const lineStart = this.draft.lastIndexOf('\n', start - 1) + 1;
  //    this.draft = this.draft.slice(0, lineStart) + '## ' + this.draft.slice(lineStart);
  //    this.onInput();
  //    requestAnimationFrame(() => ta.setSelectionRange(start + 3, start + 3));
  //  });
  //}
  //
  //insertList() {
  //  this.withTextarea((ta) => {
  //    const start = ta.selectionStart ?? 0;
  //    const end = ta.selectionEnd ?? 0;
  //    const selected = this.draft.slice(start, end) || 'élément';
  //    const lines = selected.split('\n').map(l => `- ${l || '...'}`).join('\n');
  //    this.draft = this.draft.slice(0, start) + lines + this.draft.slice(end);
  //    this.onInput();
  //    requestAnimationFrame(() => ta.setSelectionRange(start, start + lines.length));
  //  });
  //}
  //
  //insertLink() {
  //  this.withTextarea((ta) => {
  //    const start = ta.selectionStart ?? 0;
  //    const end = ta.selectionEnd ?? 0;
  //    const selected = this.draft.slice(start, end) || 'Texte du lien';
  //    const snippet = `[${selected}](https://exemple.com)`;
  //    this.draft = this.draft.slice(0, start) + snippet + this.draft.slice(end);
  //    this.onInput();
  //    requestAnimationFrame(() => ta.setSelectionRange(start + 1, start + 1 + selected.length));
  //  });
  //}
  //
  //parseMarkdown(content: string): SafeHtml {
  //  const html = marked.parse(content) as string;
  //  return this.sanitizer.bypassSecurityTrustHtml(html);
  //}
}
