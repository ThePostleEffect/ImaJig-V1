import React, { useRef, useState, useEffect } from 'react';
import { PuzzleBoard } from '../components/PuzzleBoard';
import { PuzzleConfig, GameState } from '../engine/types';
import { PuzzleGenerator } from '../engine/generator';
import { savePuzzle, listPuzzles, SavedPuzzle, deletePuzzle, getLastPuzzle, calculateProgress, formatLastPlayed } from '../storage/db';
import { Trash2, Play, Upload, Image as ImageIcon, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

export default function Home({ onReplayTutorial }: { onReplayTutorial?: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [config, setConfig] = useState<PuzzleConfig | null>(null);
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>([]);
  const [lastPuzzle, setLastPuzzle] = useState<SavedPuzzle | null>(null);
  const [activePuzzleId, setActivePuzzleId] = useState<number | undefined>(undefined);
  const [initialState, setInitialState] = useState<GameState | undefined>(undefined);
  
  // Config State
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [cutStyle, setCutStyle] = useState<'classic' | 'retro' | 'shapes'>('classic');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'custom'>('easy');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Update rows/cols when difficulty changes
  useEffect(() => {
    if (difficulty === 'easy') {
      setRows(5);
      setCols(5);
    } else if (difficulty === 'medium') {
      setRows(10);
      setCols(10);
    } else if (difficulty === 'hard') {
      setRows(15);
      setCols(15);
    }
  }, [difficulty]);

  useEffect(() => {
    loadSavedPuzzles();
  }, []);

  const loadSavedPuzzles = async () => {
    const list = await listPuzzles();
    setSavedPuzzles(list.slice(0, 12)); // Limit to 12 most recent
    
    const last = await getLastPuzzle();
    setLastPuzzle(last);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => setSelectedImage(img);
        img.src = evt.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStart = () => {
    if (!selectedImage) return;
    
    const newConfig: PuzzleConfig = {
      image: selectedImage,
      rows,
      cols,
      cutStyle,
      seed: Date.now(),
      rotationEnabled: false
    };
    
    setConfig(newConfig);
    setActivePuzzleId(undefined);
    setInitialState(undefined);
    setIsPlaying(true);
  };

  const handleResume = async (saved: SavedPuzzle) => {
    if (!saved.id) return;
    
    // Reconstruct config
    const img = new Image();
    img.src = URL.createObjectURL(saved.serializedConfig.imageBlob);
    await new Promise(r => img.onload = r);
    
    const restoredConfig: PuzzleConfig = {
      image: img,
      rows: saved.serializedConfig.rows,
      cols: saved.serializedConfig.cols,
      cutStyle: saved.serializedConfig.cutStyle as any,
      seed: saved.serializedConfig.seed,
      rotationEnabled: false
    };
    
    const generator = new PuzzleGenerator();
    const generated = await generator.generate(restoredConfig);
    const savedPieces = saved.gameState?.pieces || {};

    Object.entries(savedPieces).forEach(([id, savedPiece]) => {
      const piece = generated.pieces[id];
      if (!piece) return;
      if (savedPiece.currentPose) {
        piece.currentPose = { ...savedPiece.currentPose, rotation: 0 };
      } else {
        piece.currentPose.rotation = 0;
      }
      piece.correctPose.rotation = 0;
      if (typeof savedPiece.groupId === 'string') piece.groupId = savedPiece.groupId;
      if (typeof savedPiece.isLocked === 'boolean') piece.isLocked = savedPiece.isLocked;
      if (typeof savedPiece.zIndex === 'number') piece.zIndex = savedPiece.zIndex;
      if (typeof savedPiece.inTray === 'boolean') piece.inTray = savedPiece.inTray;
    });

    if (saved.gameState?.groups) generated.groups = saved.gameState.groups;
    if (typeof saved.gameState?.elapsedTime === 'number') generated.elapsedTime = saved.gameState.elapsedTime;
    if (typeof saved.gameState?.moveCount === 'number') generated.moveCount = saved.gameState.moveCount;
    if (typeof saved.gameState?.isComplete === 'boolean') generated.isComplete = saved.gameState.isComplete;
    if (saved.gameState?.pan) generated.pan = saved.gameState.pan;
    if (typeof saved.gameState?.zoom === 'number') generated.scale = saved.gameState.zoom;
    generated.startTime = Date.now();

    setConfig(restoredConfig);
    setInitialState(generated);
    setActivePuzzleId(saved.id);
    setIsPlaying(true);
  };

  const handleSave = async (state: GameState, thumbnail: Blob) => {
    if (!config) return;
    await savePuzzle(
      `Puzzle ${new Date().toLocaleString()}`,
      config,
      state,
      thumbnail,
      activePuzzleId
    );
    loadSavedPuzzles();
    toast.success('Puzzle saved');
  };

  const requestDelete = (id: number) => {
    setPendingDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (pendingDeleteId == null) return;
    await deletePuzzle(pendingDeleteId);
    setPendingDeleteId(null);
    setDeleteDialogOpen(false);
    loadSavedPuzzles();
    toast.success('Puzzle deleted');
  };

  if (isPlaying && config) {
    return (
      <PuzzleBoard 
        config={config} 
        onSave={handleSave} 
        onExit={() => {
          setIsPlaying(false);
          setConfig(null);
          setInitialState(undefined);
          loadSavedPuzzles();
        }} 
        initialState={initialState}
      />
    );
  }

  return (
    <div className="imajig-home min-h-screen bg-[#F0F0F0] p-4 md:p-8 font-sans text-foreground">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center">
              <div className="w-8 h-8 bg-secondary rounded-full" />
            </div>
            <h1 className="text-6xl font-black uppercase tracking-tighter" style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.2)' }}>
              ImaJig
            </h1>
          </div>
          
          {/* Tutorial Button */}
          <button
            onClick={onReplayTutorial}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-black font-bold uppercase text-sm hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
            title="Replay Tutorial"
          >
            <HelpCircle size={16} />
            Tutorial
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* New Puzzle Section */}
          <section id="create" className="neo-card p-6 bg-white relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-secondary px-4 py-1 border-l-2 border-b-2 border-black font-bold uppercase text-sm">
              New Game
            </div>
            
            <h2 className="text-3xl font-bold mb-6 uppercase">Create Puzzle</h2>
            
            <div className="space-y-6">
              {/* Image Upload */}
              <div className="border-2 border-dashed border-black p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload}
                  ref={fileInputRef}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {selectedImage ? (
                  <img src={selectedImage.src} alt="Preview" className="max-h-64 mx-auto border-2 border-black shadow-md" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <Upload size={48} />
                    <span className="font-bold uppercase">Drop image or click to upload</span>
                  </div>
                )}
              </div>

              {/* Difficulty Selection */}
              <div>
                <label className="block font-bold uppercase text-sm mb-2">Difficulty</label>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {['easy', 'medium', 'hard', 'custom'].map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d as any)}
                      className={`px-2 py-2 border-2 border-black font-bold uppercase text-xs transition-all
                        ${difficulty === d 
                          ? 'bg-primary text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] translate-x-[-1px] translate-y-[-1px]' 
                          : 'bg-white hover:bg-gray-100'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                {difficulty === 'custom' && (
                  <div className="space-y-4 p-4 border-2 border-black bg-gray-50 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold uppercase text-xs mb-1">Rows ({rows})</label>
                        <input 
                          type="range" min="2" max="20" value={rows} 
                          onChange={e => setRows(Number(e.target.value))}
                          className="w-full accent-primary h-4 bg-gray-200 border-2 border-black appearance-none"
                        />
                      </div>
                      <div>
                        <label className="block font-bold uppercase text-xs mb-1">Cols ({cols})</label>
                        <input 
                          type="range" min="2" max="20" value={cols} 
                          onChange={e => setCols(Number(e.target.value))}
                          className="w-full accent-primary h-4 bg-gray-200 border-2 border-black appearance-none"
                        />
                      </div>
                    </div>

                  </div>
                )}
                
                {difficulty !== 'custom' && (
                  <div className="text-xs font-mono text-gray-500 mb-4">
                    {difficulty === 'easy' && '25 Pieces'}
                    {difficulty === 'medium' && '100 Pieces'}
                    {difficulty === 'hard' && '225 Pieces'}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold uppercase text-sm mb-2">Cut Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {['classic', 'retro', 'shapes'].map(style => (
                    <button
                      key={style}
                      onClick={() => setCutStyle(style as any)}
                      className={`px-2 py-2 border-2 border-black font-bold uppercase text-xs transition-all
                        ${cutStyle === style 
                          ? 'bg-primary text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] translate-x-[-1px] translate-y-[-1px]' 
                          : 'bg-white hover:bg-gray-100'}`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleStart}
                disabled={!selectedImage}
                className="w-full neo-btn py-4 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Puzzle
              </button>
            </div>
          </section>

          {/* Saved Puzzles Section */}
          <section className="neo-card p-6 bg-white relative">
            <div className="absolute top-0 right-0 bg-gray-200 px-4 py-1 border-l-2 border-b-2 border-black font-bold uppercase text-sm">
              Library
            </div>
            
            <h2 className="text-3xl font-bold mb-6 uppercase">Your Puzzles</h2>
            
            {/* Resume Last Puzzle Button */}
            {lastPuzzle && (
              <div className="mb-6">
                <button 
                  onClick={() => handleResume(lastPuzzle)}
                  className="w-full neo-btn py-4 text-xl bg-primary text-white border-2 border-black hover:bg-primary/90 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  <div className="flex items-center justify-center gap-3">
                    <Play size={24} />
                    <div className="text-left">
                      <div className="font-bold">Resume Last Puzzle</div>
                      <div className="text-sm opacity-90">{calculateProgress(lastPuzzle)}% • {formatLastPlayed(lastPuzzle.updatedAt)}</div>
                    </div>
                  </div>
                </button>
              </div>
            )}
            
            {/* Puzzle Gallery Grid */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {savedPuzzles.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-bold uppercase space-y-4">
                  <div>No saved puzzles yet</div>
                  <div className="text-xs font-mono text-gray-400 normal-case">
                    Start a puzzle and it will appear here for quick resume.
                  </div>
                  <button
                    onClick={() => {
                      document.getElementById('create')?.scrollIntoView({ behavior: 'smooth' });
                      fileInputRef.current?.click();
                    }}
                    className="neo-btn px-4 py-2 text-xs"
                  >
                    Choose an Image
                  </button>
                </div>
              ) : (
                savedPuzzles.map(puzzle => {
                  const progress = calculateProgress(puzzle);
                  const isComplete = puzzle.gameState.isComplete;
                  
                  return (
                    <div key={puzzle.id} className="border-2 border-black p-3 flex gap-4 items-center hover:bg-gray-50 transition-colors group cursor-pointer">
                      <div className="w-16 h-16 bg-gray-200 border-2 border-black shrink-0 overflow-hidden">
                        <img 
                          src={URL.createObjectURL(puzzle.thumbnail)} 
                          alt="Puzzle thumbnail"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to icon if thumbnail fails to load
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling!.classList.remove('hidden');
                          }}
                        />
                        <div className="w-full h-full flex items-center justify-center text-gray-400 hidden">
                          <ImageIcon size={20} />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0" onClick={() => handleResume(puzzle)}>
                        <h3 className="font-bold truncate text-sm">{puzzle.name}</h3>
                        <p className="text-xs text-gray-500 font-mono">
                          {formatLastPlayed(puzzle.updatedAt)} • {puzzle.serializedConfig.rows}×{puzzle.serializedConfig.cols}
                        </p>
                        <div className="mt-2 flex gap-2 items-center">
                          <div className="flex-1 bg-gray-200 border border-black h-2 relative overflow-hidden">
                            <div 
                              className={`h-full transition-all ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold min-w-[3rem] text-right">
                            {isComplete ? '✓ Done' : `${progress}%`}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleResume(puzzle); }}
                          className="p-1.5 bg-primary text-white border border-black hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] text-xs"
                          title="Play"
                        >
                          <Play size={12} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); requestDelete(puzzle.id!); }}
                          className="p-1.5 bg-destructive text-white border border-black hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] text-xs"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
        
        {/* Sample Images Quick Start */}
        <section className="mt-12">
          <h3 className="text-2xl font-bold mb-4 uppercase">Quick Start</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              '/images/sample-landscape.jpg',
              '/images/sample-cyberpunk.jpg',
              '/images/sample-animal.jpg',
              '/images/hero-bg.png',
              '/images/old-oak.png',
              '/images/US-flag.png',
              '/images/alien-planet.png',
              '/images/flowers.png',
              '/images/mountain-lake.png',
              '/images/newspaper-maze.png',
              '/images/heart-diagram.png',
              '/images/fungi-beauty.png'
            ].map((src, i) => (
              <button 
                key={i}
                onClick={() => {
                  const img = new Image();
                  img.onload = () => setSelectedImage(img);
                  img.src = src;
                }}
                className="group relative aspect-square border-2 border-black overflow-hidden hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
              >
                <img src={src} alt="Sample" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this puzzle?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

