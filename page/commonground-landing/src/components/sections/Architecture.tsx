import { motion } from 'motion/react';
import { useInView } from '../hooks/useInView';

export function Architecture() {
  const { ref, isInView } = useInView({ threshold: 0.1 });

  return (
    <section id="architecture" className="section bg-commonground" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            System <span className="text-gradient">Architecture</span>
          </h2>
          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
            Serverless event-driven architecture powered by AWS services and Claude Sonnet 4.6.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-6xl mx-auto"
        >
          <div className="glow-card p-8">
            <img
              src={`${import.meta.env.BASE_URL}Arch_Diagram.png`}
              alt="CommonGround Architecture Diagram"
              className="w-full h-auto rounded-lg"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
