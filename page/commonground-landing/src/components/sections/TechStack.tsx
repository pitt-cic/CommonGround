import { motion } from 'motion/react';
import { useInView } from '../hooks/useInView';

const technologies = [
  { name: 'AWS CDK', category: 'Infrastructure' },
  { name: 'Amazon Bedrock', category: 'AI' },
  { name: 'Claude Sonnet 4.6', category: 'AI' },
  { name: 'AWS Lambda', category: 'Compute' },
  { name: 'Amazon S3', category: 'Storage' },
  { name: 'Amazon DynamoDB', category: 'Database' },
  { name: 'Amazon API Gateway', category: 'API' },
  { name: 'Amazon Cognito', category: 'Auth' },
  { name: 'AWS Amplify', category: 'Hosting' },
  { name: 'Pydantic AI', category: 'Framework' },
  { name: 'React', category: 'Frontend' },
  { name: 'TypeScript', category: 'Language' },
  { name: 'Python 3.12', category: 'Language' },
  { name: 'PyMuPDF', category: 'PDF Processing' },
  { name: 'Tailwind CSS', category: 'Styling' },
];

export function TechStack() {
  const { ref, isInView } = useInView({ threshold: 0.1 });

  return (
    <section id="tech-stack" className="section bg-[var(--color-bg-secondary)]" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Tech <span className="text-gradient">Stack</span>
          </h2>
          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
            Built with modern serverless technologies and powered by Claude Sonnet 4.6.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          <div className="flex flex-wrap gap-3 justify-center">
            {technologies.map((tech, index) => (
              <motion.div
                key={tech.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group relative"
              >
                <div className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-accent)] transition-all hover:scale-105">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {tech.name}
                  </span>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {tech.category}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
