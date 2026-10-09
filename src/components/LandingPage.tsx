import React from 'react';
import { Calendar, Trophy, ChevronRight, Sparkles, Layout, BarChart3, Play } from 'lucide-react';
import { motion } from 'motion/react';

interface LandingPageProps {
  onSelect: (tool: 'SEASON' | 'TOURNAMENT') => void;
}

export default function LandingPage({ onSelect }: LandingPageProps) {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-[#1C1F2A]">
      <div className="relative z-20 max-w-4xl w-full">
        {/* Glassmorphism Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-8 md:p-12 rounded-[2rem] text-center space-y-10"
        >
          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight drop-shadow-lg uppercase">
              <i>MATCH</i> <span className="text-blue-500">MASTER</span>
            </h1>
            
            <p className="text-gray-300 max-w-lg mx-auto text-lg drop-shadow-md">
              Professionelle Spielpläne und Turniere präzise, schnell und übersichtlich.
            </p>
          </div>

          {/* Buttons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {/* Season Generator Button */}
            <motion.button
              whileHover={{ y: -5, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect('SEASON')}
              className="group flex flex-col items-center text-center p-8 bg-white/5 border-2 border-white text-white rounded-3xl transition-all shadow-xl hover:bg-white/10 space-y-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Calendar size={28} />
                </div>
                <h3 className="text-xl md:text-2xl font-bold uppercase whitespace-nowrap">Saison-Planer</h3>
              </div>
              <p className="text-gray-300 text-sm">
                Generieren Sie einen ausgewogenen Liga-Spielplan über mehrere Spieltage.
              </p>
              <div className="px-8 py-3 bg-blue-600 rounded-xl font-bold uppercase tracking-widest shadow-lg group-hover:scale-105 transition-transform">
                Start
              </div>
            </motion.button>

            {/* Tournament Planner Button */}
            <motion.button
              whileHover={{ y: -5, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect('TOURNAMENT')}
              className="group flex flex-col items-center text-center p-8 bg-white/5 border-2 border-white text-white rounded-3xl transition-all shadow-xl hover:bg-white/10 space-y-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Trophy size={28} />
                </div>
                <h3 className="text-xl md:text-2xl font-bold uppercase whitespace-nowrap">Turnier-Planer</h3>
              </div>
              <p className="text-gray-300 text-sm">
                Erstellen Sie ein komplettes Turnier inklusive Gruppen, K.o.-Phasen und Live-Tabellen.
              </p>
              <div className="px-8 py-3 bg-blue-600 rounded-xl font-bold uppercase tracking-widest shadow-lg group-hover:scale-105 transition-transform">
                Start
              </div>
            </motion.button>
          </div>

          {/* Footer Features */}
          <div className="flex flex-wrap justify-center gap-8 text-[10px] uppercase font-bold text-gray-400 tracking-widest pt-4">
            <div className="flex items-center gap-2"><Layout size={12} /> Flexible Formate</div>
            <div className="flex items-center gap-2"><BarChart3 size={12} /> Live-Tabellen</div>
            <div className="flex items-center gap-2"><Sparkles size={12} /> KI-Optimiert</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
