
import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';

interface Props {
  content: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  viewMode?: 'page' | 'fluid';
}

const RichEditor: React.FC<Props> = ({ content, onChange, className, placeholder, viewMode = 'page' }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
        attributes: {
            class: (viewMode === 'page' 
              ? 'prose prose-sm focus:outline-none w-full min-h-full break-words max-w-none' 
              : 'prose prose-sm sm:prose-base lg:prose-lg xl:prose-2xl focus:outline-none w-full min-h-full break-words'),
        },
    },
  });

  // Handle external content updates (e.g. File Upload)
  useEffect(() => {
    if (editor && content && content !== editor.getHTML()) {
      // Only update content if the editor is NOT focused to prevent cursor jumping while typing.
      // This ensures file uploads (where editor is blurred) update correctly, 
      // but normal typing (where editor is focused) relies on internal state.
      if (!editor.isFocused) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  const editorContainerClass = viewMode === 'page'
    ? "a4-page bg-white shadow-lg min-h-[297mm] w-[210mm] p-[20mm] cursor-text print:shadow-none print:w-full print:h-full print:p-[15mm]"
    : "w-full min-h-full bg-white p-6 sm:p-8 cursor-text max-w-none";

  const wrapperClass = viewMode === 'page'
    ? "flex-1 overflow-y-auto p-8 flex justify-center bg-gray-100 print:p-0 print:bg-white print:overflow-visible"
    : "flex-1 overflow-y-auto bg-gray-50 flex flex-col";

  return (
    <div className={`flex flex-col bg-gray-50 overflow-hidden ${className}`}>
      <div className="bg-white p-2 flex flex-wrap gap-1 border-b border-gray-200 sticky top-0 z-10 shadow-sm items-center shrink-0">
        <MenuButton 
          active={editor.isActive('bold')} 
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </MenuButton>
        <MenuButton 
          active={editor.isActive('italic')} 
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </MenuButton>
        <MenuButton 
          active={editor.isActive('underline')} 
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </MenuButton>
        <div className="w-px h-4 bg-gray-200 dark:bg-[#333333] mx-2 self-center" />
        
        {/* Alignment Controls */}
        <MenuButton 
          active={editor.isActive({ textAlign: 'left' })} 
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          Left
        </MenuButton>
        <MenuButton 
          active={editor.isActive({ textAlign: 'center' })} 
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          Center
        </MenuButton>
        <MenuButton 
          active={editor.isActive({ textAlign: 'right' })} 
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          Right
        </MenuButton>
        <MenuButton 
          active={editor.isActive({ textAlign: 'justify' })} 
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          Justify
        </MenuButton>

        <div className="w-px h-4 bg-gray-200 dark:bg-[#333333] mx-2 self-center" />
        
        <MenuButton 
          active={editor.isActive('bulletList')} 
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          List
        </MenuButton>
        <MenuButton 
          active={editor.isActive('orderedList')} 
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </MenuButton>
        <div className="w-px h-4 bg-gray-200 dark:bg-[#333333] mx-2 self-center" />
        <MenuButton 
          active={editor.isActive('heading', { level: 2 })} 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H1
        </MenuButton>
        <MenuButton 
          active={editor.isActive('heading', { level: 3 })} 
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H2
        </MenuButton>
      </div>
      
      {/* Scrollable Content Area */}
      <div className={wrapperClass}>
          <div className={editorContainerClass} onClick={() => editor.chain().focus().run()}>
             <EditorContent editor={editor} />
          </div>
      </div>
    </div>
  );
};

const MenuButton: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1 text-xs font-bold transition-all border ${active ? 'bg-black text-white border-black' : 'text-gray-600 border-transparent hover:bg-gray-100'}`}
  >
    {children}
  </button>
);

export default RichEditor;
