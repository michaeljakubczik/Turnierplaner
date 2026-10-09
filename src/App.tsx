/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import LandingPage from './components/LandingPage';
import SeasonGenerator from './components/SeasonGenerator';
import TournamentPlanner from './components/TournamentPlanner';

export default function App() {
  const [view, setView] = useState<'LANDING' | 'SEASON' | 'TOURNAMENT'>('LANDING');

  return (
    <>
      {view === 'LANDING' && <LandingPage onSelect={setView} />}
      {view === 'SEASON' && <SeasonGenerator onBack={() => setView('LANDING')} />}
      {view === 'TOURNAMENT' && <TournamentPlanner onBack={() => setView('LANDING')} />}
    </>
  );
}
