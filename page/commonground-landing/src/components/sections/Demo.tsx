import { motion } from 'motion/react';
import { useInView } from '../hooks/useInView';

export function Demo() {
  const { ref, isInView } = useInView({ threshold: 0.1 });

  return (
    <section id="demo" className="section bg-[var(--color-bg-secondary)]" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            See It In <span className="text-gradient">Action</span>
          </h2>
          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
            Watch how CommonGround transforms academic research into accessible content in seconds.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-5xl mx-auto"
        >
          <div className="glow-card overflow-hidden">
            <video
              controls
              className="w-full aspect-video bg-[var(--color-bg-tertiary)]"
              poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Crect fill='%231a1a1a' width='1280' height='720'/%3E%3C/svg%3E"
            >
              <source src={`${import.meta.env.BASE_URL}demo.mp4`} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
