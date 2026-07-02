'use client';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Camera, CheckCircle, AlertCircle, Loader2, X, UserCheck, RefreshCw, ShieldCheck,
} from 'lucide-react';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const MATCH_THRESHOLD = 0.55;

type ActionMode = 'check-in' | 'check-out';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  actionMode?: ActionMode;
}

function euclidean(a: Float32Array, b: number[]): number {
  if (b.length !== a.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export default function FaceVerification({ onClose, onSuccess, actionMode = 'check-in' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceapiRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  const [phase, setPhase] = useState<'loading' | 'register' | 'verify' | 'done' | 'error'>('loading');
  const [loadMsg, setLoadMsg] = useState('Loading AI face models…');
  const [faceDetected, setFaceDetected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [matchScore, setMatchScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoadMsg('Loading face detection models…');
        const faceapi = await import('face-api.js');
        if (cancelled) return;
        faceapiRef.current = faceapi;

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (cancelled) return;

        setLoadMsg('Starting camera…');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (cancelled) return;

        // Check if user has a registered face
        const { data } = await api.get('/hr/employees/me/face');
        if (cancelled) return;

        setPhase(data.data?.registered ? 'verify' : 'register');
        startLoop(faceapi);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.name === 'NotAllowedError' || e?.message?.includes('camera')
          ? 'Camera access denied — please allow camera permission and retry.'
          : `Failed to start: ${e.message || 'unknown error'}`;
        setStatusMsg(msg);
        setPhase('error');
      }
    }

    init();
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function startLoop(faceapi: any) {
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || processingRef.current) return;

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true);

      const dims = faceapi.matchDimensions(canvas, video, true);
      const resized = faceapi.resizeResults(detections, dims);

      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      if (resized.length > 0) {
        setFaceDetected(true);
        faceapi.draw.drawDetections(canvas, resized);
        faceapi.draw.drawFaceLandmarks(canvas, resized);
      } else {
        setFaceDetected(false);
      }
    }, 250);
  }

  async function captureDescriptor(): Promise<Float32Array | null> {
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video) return null;
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    return result?.descriptor ?? null;
  }

  async function handleRegister() {
    processingRef.current = true;
    setProcessing(true);
    setStatusMsg('Capturing face…');
    try {
      const descriptor = await captureDescriptor();
      if (!descriptor) {
        setStatusMsg('No face detected — position your face clearly in the frame.');
        return;
      }
      setStatusMsg('Saving face registration…');
      await api.post('/hr/employees/me/face', { descriptor: Array.from(descriptor) });
      toast.success('Face registered successfully!');
      setPhase('verify');
      setStatusMsg('Face registered. You can now use face check-in.');
    } catch (e: any) {
      setStatusMsg(e?.response?.data?.message || 'Registration failed — please try again.');
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  async function handleVerify() {
    processingRef.current = true;
    setProcessing(true);
    setStatusMsg('Capturing your face…');
    setMatchScore(null);
    try {
      const liveDescriptor = await captureDescriptor();
      if (!liveDescriptor) {
        setStatusMsg('No face detected — look directly at the camera.');
        return;
      }

      setStatusMsg('Fetching stored face…');
      const { data } = await api.get('/hr/employees/me/face');
      const stored: number[] | null = data.data?.descriptor;
      if (!stored) {
        setStatusMsg('No registered face found — please register first.');
        setPhase('register');
        return;
      }

      const dist = euclidean(liveDescriptor, stored);
      setMatchScore(dist);

      if (dist > MATCH_THRESHOLD) {
        setStatusMsg(`Face not recognised (confidence: ${((1 - dist) * 100).toFixed(0)}%). Please try again.`);
        return;
      }

      setStatusMsg('Face verified! Logging attendance…');
      const endpoint = actionMode === 'check-in' ? '/hr/attendance/check-in' : '/hr/attendance/check-out';
      await api.post(endpoint);

      setPhase('done');
      setStatusMsg(actionMode === 'check-in' ? 'Checked in successfully!' : 'Checked out successfully!');
      toast.success(actionMode === 'check-in' ? 'Checked in via face' : 'Checked out via face');
      successTimerRef.current = setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (e: any) {
      setStatusMsg(e?.response?.data?.message || 'Verification failed — please try again.');
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  const faceRingColor = faceDetected ? 'border-green-400 shadow-green-400/30' : 'border-white/30';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {phase === 'register' ? 'Register Face' : phase === 'done' ? 'Verified' : `Face ${actionMode === 'check-in' ? 'Check-In' : 'Check-Out'}`}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera feed */}
        <div className="relative bg-gray-950" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Face guide oval */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-40 h-52 rounded-full border-2 ${faceRingColor} border-dashed shadow-lg transition-all duration-300`} />
          </div>

          {/* Loading overlay */}
          {phase === 'loading' && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-white text-xs text-center px-6">{loadMsg}</p>
            </div>
          )}

          {/* Success overlay */}
          {phase === 'done' && (
            <div className="absolute inset-0 bg-green-900/80 flex flex-col items-center justify-center gap-3">
              <CheckCircle className="w-14 h-14 text-green-400" />
              <p className="text-white text-sm font-medium">{statusMsg}</p>
            </div>
          )}

          {/* Face detected indicator */}
          {(phase === 'verify' || phase === 'register') && (
            <div className={`absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${faceDetected ? 'bg-green-500/90 text-white' : 'bg-black/50 text-gray-300'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${faceDetected ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
              {faceDetected ? 'Face detected' : 'No face'}
            </div>
          )}
        </div>

        {/* Bottom panel */}
        <div className="p-4 space-y-3">
          {/* Status message */}
          {statusMsg && phase !== 'done' && (
            <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 ${
              statusMsg.includes('not recognised') || statusMsg.includes('failed') || statusMsg.includes('denied')
                ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                : 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
            }`}>
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {statusMsg}
            </div>
          )}

          {/* Match score debug */}
          {matchScore !== null && matchScore > MATCH_THRESHOLD && (
            <p className="text-xs text-gray-400 text-center">
              Distance: {matchScore.toFixed(3)} (threshold: {MATCH_THRESHOLD}) — try better lighting or re-register
            </p>
          )}

          {/* Error phase */}
          {phase === 'error' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {statusMsg}
              </div>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                Close
              </button>
            </div>
          )}

          {/* Register phase */}
          {phase === 'register' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 text-center">
                Look straight at the camera in good lighting, then click register.
              </p>
              <button
                onClick={handleRegister}
                disabled={!faceDetected || processing}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                {processing ? 'Registering…' : 'Register My Face'}
              </button>
            </div>
          )}

          {/* Verify phase */}
          {phase === 'verify' && (
            <div className="space-y-2">
              <button
                onClick={handleVerify}
                disabled={!faceDetected || processing}
                className={`w-full py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-2 ${
                  actionMode === 'check-in' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {processing ? 'Verifying…' : actionMode === 'check-in' ? 'Verify & Check In' : 'Verify & Check Out'}
              </button>
              <button
                onClick={() => { setPhase('register'); setStatusMsg(''); setMatchScore(null); }}
                className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Re-register face
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
