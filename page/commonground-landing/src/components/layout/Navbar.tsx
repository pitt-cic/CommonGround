import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[var(--color-bg-secondary)]/95 backdrop-blur-lg border-b border-[var(--color-border-subtle)]'
          : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <a href="#" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-dark)] flex items-center justify-center">
              <span className="text-black font-bold text-lg">C</span>
            </div>
            <span className="text-xl font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-primary)] transition-colors">
              CommonGround
            </span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors">
              Features
            </a>
            <a href="#demo" className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors">
              Demo
            </a>
            <a href="#architecture" className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors">
              Architecture
            </a>
            <a href="#tech-stack" className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors">
              Tech Stack
            </a>
            <a
              href="https://github.com/pitt-cic/CommonGround"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-dark)] font-bold hover:scale-105 transition-transform inline-flex items-center gap-2"
              style={{ color: '#000000', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#000000">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
