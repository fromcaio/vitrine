'use client';

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { User, LogOut, Settings } from "lucide-react";

export default function UserMenu({ user }: { user: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-white text-sm font-medium px-3 py-2 rounded-lg bg-white bg-opacity-10 hover:bg-opacity-20 transition flex items-center gap-2"
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border border-white/20 overflow-hidden" style={{ backgroundColor: 'var(--primary)' }}>
           {user.image ? <img src={user.image} alt={user.name} /> : <User size={18} />}
        </div>
        <span className="hidden sm:inline">{user.name || user.email}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
          <div className="px-4 py-3 border-b border-gray-100">
             <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          
          <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
            <Settings size={16} /> Painel Admin
          </Link>
          
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition border-t border-gray-100"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}