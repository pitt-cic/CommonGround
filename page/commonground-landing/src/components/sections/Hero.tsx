import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';

export function Hero() {
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsGenerating(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-grid pt-16">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[var(--color-accent-primary)] opacity-[0.08] blur-[120px] rounded-full" />

      <div className="container relative z-10 text-center px-6 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border-accent)] text-sm text-[var(--color-text-secondary)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)] animate-pulse" />
            AI-Powered Research Translation
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
          className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
        >
          Share Your Research
          <br />
          <span className="text-gradient">With The World</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="text-lg md:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10"
        >
          Upload academic papers and generate audience-tailored summaries, social media posts, press releases, and visual infographics—all backed by citation verification.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <a href="#demo" className="btn-primary">
            Watch Demo
          </a>
          <a
            href="#architecture"
            className="px-6 py-3 rounded-xl border border-[var(--color-border-accent)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            View Architecture
          </a>
        </motion.div>

        {/* Upload → Generate Visual */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
          className="max-w-4xl mx-auto"
        >
          <div className="glow-card p-6 md:p-8 text-left">
            {/* Upload Section */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-dark)] flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Uploaded Paper</p>
                <p className="text-[var(--color-text-primary)] font-medium mb-1">
                  "Post-acute sequelae of SARS-CoV-2 infection in pediatric populations"
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Target Audience: <span className="text-[var(--color-accent-primary)]">General Public</span> •
                  Format: <span className="text-[var(--color-accent-primary)]">LinkedIn Post</span>
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-accent-primary)]/30 to-transparent" />
            </div>

            {/* Loading or Generated Output */}
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center shrink-0">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 rounded-full border-2 border-[var(--color-accent-primary)]/30 border-t-[var(--color-accent-primary)]"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Generating Content</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">Claude Sonnet 4.6 is analyzing the paper...</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="output"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-accent-primary)]">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-[var(--color-text-tertiary)] mb-2">Generated LinkedIn Post</p>
                      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 mb-3">
                        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3">
                          COVID-19 is not just an adult problem — and a major new study proves it.
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3">
                          A large study published in Nature Communications analyzed health records from nearly 1.2 million children and teenagers across 19 U.S. hospitals to understand what happens to the heart after a COVID-19 infection.
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                          <span className="text-[var(--color-accent-primary)] cursor-pointer hover:underline" title="Citation verified">Children who had COVID-19 were 63% more likely to develop some form of heart-related condition</span> in the months following infection compared to those who were never infected.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-accent-primary)]">
                          <path d="M9 11l3 3L22 4" />
                          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                        </svg>
                        <span>All statistics verified against source paper</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
