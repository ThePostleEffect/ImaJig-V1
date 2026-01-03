import React, { useState, useEffect } from 'react';
import { PuzzleBoard } from '../components/PuzzleBoard';
import { PuzzleConfig, GameState } from '../engine/types';
import { savePuzzle, listPuzzles, loadPuzzle, SavedPuzzle, deletePuzzle } from '../storage/db';
import { Trash2, Play, Upload, Image as ImageIcon } from 'lucide-react';

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [config, setConfig] = useState<PuzzleConfig | null>(null);
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>([]);
  const [activePuzzleId, setActivePuzzleId] = useState<number | undefined>(undefined);
  
  // Config State
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [cutStyle, setCutStyle] = useState<'classic' | 'retro' | 'shapes'>('classic');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'custom'>('easy');
  const [rotationEnabled, setRotationEnabled] = useState(false);

  // Update rows/cols/rotation when difficulty changes
  useEffect(() => {
    if (difficulty === 'easy') {
      setRows(5);
      setCols(5);
      setRotationEnabled(false);
    } else if (difficulty === 'medium') {
      setRows(10);
      setCols(10);
      setRotationEnabled(false);
    } else if (difficulty === 'hard') {
      setRows(15);
      setCols(15);
      setRotationEnabled(true);
    }
  }, [difficulty]);

  useEffect(() => {
    loadSavedPuzzles();
  }, []);

  const loadSavedPuzzles = async () => {
    const list = await listPuzzles();
    setSavedPuzzles(list);
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
      rotationEnabled
    };
    
    setConfig(newConfig);
    setActivePuzzleId(undefined);
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
      rotationEnabled: saved.serializedConfig.rotationEnabled || false
    };
    
    setConfig(restoredConfig);
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
    // Don't exit, just notify?
    alert('Saved!');
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this puzzle?')) {
      await deletePuzzle(id);
      loadSavedPuzzles();
    }
  };

  if (isPlaying && config) {
    return (
      <PuzzleBoard 
        config={config} 
        onSave={handleSave} 
        onExit={() => {
          setIsPlaying(false);
          setConfig(null);
          loadSavedPuzzles();
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F0] p-4 md:p-8 font-sans text-foreground">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex items-center gap-4">
          <div className="w-16 h-16 bg-primary border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center">
            <div className="w-8 h-8 bg-secondary rounded-full" />
          </div>
          <h1 className="text-6xl font-black uppercase tracking-tighter" style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.2)' }}>
            ImaJig
          </h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* New Puzzle Section */}
          <section className="neo-card p-6 bg-white relative overflow-hidden">
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
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="rotation"
                        checked={rotationEnabled}
                        onChange={e => setRotationEnabled(e.target.checked)}
                        className="w-5 h-5 border-2 border-black rounded-none accent-primary"
                      />
                      <label htmlFor="rotation" className="font-bold uppercase text-xs cursor-pointer">Enable Rotation</label>
                    </div>
                  </div>
                )}
                
                {difficulty !== 'custom' && (
                  <div className="text-xs font-mono text-gray-500 mb-4">
                    {difficulty === 'easy' && '25 Pieces • No Rotation'}
                    {difficulty === 'medium' && '100 Pieces • No Rotation'}
                    {difficulty === 'hard' && '225 Pieces • Rotation Enabled'}
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

              <button 
                onClick={() => {
                  if (!selectedImage) {
                    // Use a placeholder if no image selected
                    const img = new Image();
                    img.onload = () => {
                      setSelectedImage(img);
                      setRows(3);
                      setCols(3);
                      setCutStyle('classic');
                      
                      // Need to wait for state update, so we'll just force start here
                      const newConfig: PuzzleConfig = {
                        image: img,
                        rows: 3,
                        cols: 3,
                        cutStyle: 'classic',
                        seed: 12345, // Fixed seed for reproducibility
                        rotationEnabled: false
                      };
                      setConfig(newConfig);
                      setActivePuzzleId(undefined);
                      setIsPlaying(true);
                    };
                    img.src = '/images/hero-bg.png'; // Use existing asset
                  } else {
                    setRows(3);
                    setCols(3);
                    setCutStyle('classic');
                    const newConfig: PuzzleConfig = {
                      image: selectedImage,
                      rows: 3,
                      cols: 3,
                      cutStyle: 'classic',
                      seed: 12345, // Fixed seed for reproducibility
                      rotationEnabled: false
                    };
                    setConfig(newConfig);
                    setActivePuzzleId(undefined);
                    setIsPlaying(true);
                  }
                }}
                className="w-full bg-yellow-400 text-black border-2 border-black py-2 font-bold uppercase hover:bg-yellow-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none transition-all"
              >
                Test: Golden 3x3 (Classic)
              </button>
            </div>
          </section>

          {/* Saved Puzzles Section */}
          <section className="neo-card p-6 bg-white relative">
            <div className="absolute top-0 right-0 bg-gray-200 px-4 py-1 border-l-2 border-b-2 border-black font-bold uppercase text-sm">
              Library
            </div>
            
            <h2 className="text-3xl font-bold mb-6 uppercase">Saved Games</h2>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {savedPuzzles.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold uppercase">
                  No saved puzzles yet
                </div>
              ) : (
                savedPuzzles.map(puzzle => (
                  <div key={puzzle.id} className="border-2 border-black p-2 flex gap-4 items-center hover:bg-gray-50 transition-colors group">
                    <div className="w-20 h-20 bg-gray-200 border-2 border-black shrink-0 overflow-hidden">
                      {/* Thumbnail would go here */}
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon size={24} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate">{puzzle.name}</h3>
                      <p className="text-xs text-gray-500 font-mono">
                        {new Date(puzzle.updatedAt).toLocaleDateString()} • {puzzle.serializedConfig.cutStyle}
                      </p>
                      <div className="mt-1 flex gap-2">
                        <span className="text-xs bg-secondary px-1 border border-black font-bold">
                          {Math.floor(puzzle.gameState.elapsedTime / 60)}m
                        </span>
                        <span className="text-xs bg-gray-200 px-1 border border-black font-bold">
                          {Math.round((Object.keys(puzzle.gameState.groups).length / Object.keys(puzzle.gameState.pieces).length) * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleResume(puzzle)}
                        className="p-2 bg-primary text-white border-2 border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      >
                        <Play size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(puzzle.id!)}
                        className="p-2 bg-destructive text-white border-2 border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
        
        {/* Sample Images Quick Start */}
        <section className="mt-12">
          <h3 className="text-2xl font-bold mb-4 uppercase">Quick Start</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['/images/sample-landscape.jpg', '/images/sample-cyberpunk.jpg', '/images/sample-animal.jpg', '/images/hero-bg.png'].map((src, i) => (
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
    </div>
  );
}
