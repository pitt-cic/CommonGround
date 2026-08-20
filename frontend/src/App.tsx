import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import ForceChangePasswordPage from './pages/ForceChangePasswordPage';
import ModelExamplesPage from './pages/ModelExamplesPage';
import StepIndicator from './components/Steps/StepIndicator';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import UploadStep from './components/Steps/UploadStep';
import CustomizeStep, { type OutputTypeId, type CustomAudience, type InfographicTemplateId, MODEL } from './components/Steps/CustomizeStep';
import GenerateStep from './components/Steps/GenerateStep';
import ResultsStep from './components/Steps/ResultsStep';
import { startSummarization } from './services/api';
import { mapReadingLevelToAudience, mapOutputTypeToFormat } from './utils/mappings';

const TOTAL_STEPS = 4;

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 32 : -32 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -32 : 32 }),
};

function MainApp() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [displayStep, setDisplayStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const isLight = theme === 'light';

  // Check if we should restore state from examples page
  useEffect(() => {
    const state = location.state as any;
    if (state?.returnFromExamples && state.s3Key) {
      // Restore state when returning from examples
      setS3Key(state.s3Key);
      setFileName(state.fileName);
      setReadingLevel(state.readingLevel ?? 0);
      setOutputType(state.outputType ?? null);
      setFilePageCount(state.filePageCount ?? null);
      setFileSize(state.fileSize ?? null);
      setUseCustomAudience(state.useCustomAudience ?? false);
      setCustomAudience(state.customAudience ?? '');
      setInfographicTemplate(state.infographicTemplate ?? null);
      setStep(1);
      setDisplayStep(1);

      // Create a mock File object for display purposes
      if (state.fileName) {
        const mockFile = new File([], state.fileName, { type: 'application/pdf' });
        setFile(mockFile);
      }

      // Clear location state so refresh goes to clean upload state
      navigate('/', { replace: true });
    }
  }, [location.state, navigate]);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [_fileName, setFileName] = useState<string | null>(null);
  const [filePageCount, setFilePageCount] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [readingLevel, setReadingLevel] = useState(0);
  const [outputType, setOutputType] = useState<OutputTypeId | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useCustomAudience, setUseCustomAudience] = useState(false);
  const [customAudience, setCustomAudience] = useState<CustomAudience>('');
  const [infographicTemplate, setInfographicTemplate] = useState<InfographicTemplateId>(null);

  // API state
  const [s3Key, setS3Key] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(target: number) {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  }

  async function handleGenerate() {
    if (!s3Key || outputType === null) {
      setError('Missing upload or configuration data');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Use custom audience if specified, otherwise use reading level
      let audience: string;
      let customDetails: string | undefined;

      if (useCustomAudience) {
        audience = 'custom_audience';
        customDetails = customAudience.trim() || 'General audience';
      } else {
        audience = mapReadingLevelToAudience(readingLevel);
      }

      const outputFormat = mapOutputTypeToFormat(outputType);

      const response = await startSummarization(s3Key, audience, outputFormat, MODEL.apiId, customDetails, infographicTemplate ?? undefined);
      setJobId(response.job_id);

      go(3);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start summarization';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  function reset() {
    setFile(null);
    setFileName(null);
    setFilePageCount(null);
    setFileSize(null);
    setReadingLevel(0);
    setOutputType(null);
    setIsGenerating(false);
    setS3Key(null);
    setJobId(null);
    setError(null);
    setDirection(-1);
    setStep(0);
    setUseCustomAudience(false);
    setCustomAudience('');
    setInfographicTemplate(null);
  }

  const canContinue = [
    !!file,
    !!outputType,
    true,
    true,
  ][step];

  return (
    <div className={`min-h-screen flex flex-col ${isLight ? 'bg-white' : 'bg-black'}`}>
      <Navbar user={user ?? undefined} onLogout={logout} />
      <div className="flex flex-col items-center justify-center flex-1 px-8 py-8 pt-28">
      <div className={`w-full ${displayStep === 3 ? 'max-w-350' : 'max-w-270'}`}>
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className={`text-4xl font-bold tracking-tight ${isLight ? 'text-amber-500' : 'text-amber-400'}`}>CommonGround</h1>
          <p className={`text-md mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>Disseminate Your Research Papers for Everyone</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-2 text-red-500 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction} onExitComplete={() => setDisplayStep(step)}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {step !== 3 ? (
              <div className={`rounded-xl p-6 sm:p-8 overflow-hidden relative min-h-80 border-2 ${isLight ? 'bg-zinc-100 border-amber-500' : 'bg-zinc-900 border-amber-400'}`}>
                {/* Step title */}
                <h2 className={`text-2xl font-semibold mb-1 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                  {['Upload your paper', 'Customize your output', 'Generate your output'][step]}
                </h2>
                <p className={`text-sm mb-6 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
                  {[
                    'We\'ll extract the text and use it to generate the output type of your choice.',
                    'Choose your audience, output type, and optional infographic.',
                    'Review your settings, then generate your output.',
                  ][step]}
                </p>

                {step === 0 && (
                  <UploadStep
                    file={file}
                    onFileChange={(f) => {
                      setFile(f);
                      if (f) setFileName(f.name);
                    }}
                    onS3KeyChange={setS3Key}
                    storedPageCount={filePageCount}
                    storedFileSize={fileSize}
                    onPageCountChange={setFilePageCount}
                    onFileSizeChange={setFileSize}
                  />
                )}
                {step === 1 && (
                  <CustomizeStep
                    readingLevel={readingLevel}
                    outputType={outputType}
                    onReadingLevelChange={setReadingLevel}
                    onOutputTypeChange={setOutputType}
                    file={file}
                    s3Key={s3Key}
                    useCustomAudience={useCustomAudience}
                    customAudience={customAudience}
                    onUseCustomAudienceChange={setUseCustomAudience}
                    onCustomAudienceChange={setCustomAudience}
                    filePageCount={filePageCount}
                    fileSize={fileSize}
                    infographicTemplate={infographicTemplate}
                    onInfographicTemplateChange={setInfographicTemplate}
                  />
                )}
                {step === 2 && file && outputType !== null && (
                  <GenerateStep
                    file={file}
                    readingLevel={readingLevel}
                    outputType={outputType}
                    isGenerating={isGenerating}
                    onGenerate={handleGenerate}
                    useCustomAudience={useCustomAudience}
                    customAudience={customAudience}
                    infographicTemplate={infographicTemplate}
                  />
                )}
              </div>
            ) : (
              outputType !== null && (
                <ResultsStep
                  readingLevel={readingLevel}
                  outputType={outputType}
                  jobId={jobId}
                  onError={setError}
                  useCustomAudience={useCustomAudience}
                  customAudience={customAudience}
                  infographicTemplate={infographicTemplate}
                />
              )
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={isGenerating}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg border-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm cursor-pointer ${isLight ? 'border-zinc-400 text-zinc-600 hover:border-zinc-500 hover:text-zinc-800' : 'border-zinc-600 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'}`}
            >
              <ChevronLeft size={15} />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS - 1 && step !== 2 && (
            <button
              type="button"
              onClick={() => go(step + 1)}
              disabled={!canContinue}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm transition-colors cursor-pointer ${isLight ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-amber-400 hover:bg-amber-300 text-black'}`}
            >
              Continue
              <ChevronRight size={15} />
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={reset}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg border-2 transition-colors text-sm cursor-pointer ${isLight ? 'border-zinc-400 text-zinc-600 hover:border-amber-500 hover:text-amber-600' : 'border-zinc-600 text-zinc-300 hover:border-amber-400 hover:text-amber-400'}`}
            >
              <RotateCcw size={14} />
              Start over
            </button>
          )}

          {step === 2 && <div />}
        </div>
      </div>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<MainApp />} />
      <Route path="/examples" element={<ModelExamplesPage />} />
    </Routes>
  );
}
