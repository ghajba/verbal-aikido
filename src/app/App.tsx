import { useEffect, useState } from 'preact/hooks';
import { currentScreen, navigateTo } from '../ui/router';
import { HomeScreen } from '../ui/screens/HomeScreen';
import { BriefingScreen } from '../ui/screens/BriefingScreen';
import { GameScreen } from '../ui/screens/GameScreen';
import { DebriefScreen } from '../ui/screens/DebriefScreen';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import { StatsScreen } from '../ui/screens/StatsScreen';
import { HowToScreen } from '../ui/screens/HowToScreen';
import { loadScenario } from '../ui/scenarios';
import { GameController } from './gameController';
import { openStorage } from '../storage';
import { play } from '../feedback/audio';
import { haptic } from '../feedback/haptics';
import type { Scenario } from '../content/types';
import type { StorageDriver } from '../storage/types';
import { needRefresh, applyUpdate } from '../pwa';
import { currentLocale, t } from '../i18n/locale';
import { resolveAiProvider } from '../ai/resolveProvider';
import type { AiProvider } from '../ai/types';
import { ModelProgressModal } from '../ui/components/ModelProgressModal';

export function App() {
  const screen = currentScreen.value;
  const [storage, setStorage] = useState<StorageDriver | null>(null);
  const [downloadModal, setDownloadModal] = useState<{
    isOpen: boolean;
    progress: number;
    text: string;
  } | null>(null);
  const [activeGame, setActiveGame] = useState<{
    controller: GameController;
    scenario: Scenario;
  } | null>(null);

  // Initialize storage once on boot
  useEffect(() => {
    openStorage()
      .then((res) => setStorage(res.driver))
      .catch(console.error);
  }, []);

  // Listen to browser popstate
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.screen) {
        currentScreen.value = e.state.screen;
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Manage body class for game screen to avoid pull-to-refresh / gestures interfering
  useEffect(() => {
    const isGame = screen.name === 'game';
    document.body.classList.toggle('is-game-active', isGame);
    return () => {
      document.body.classList.remove('is-game-active');
    };
  }, [screen.name]);

  // When navigating to 'game', start the game controller
  useEffect(() => {
    if (screen.name === 'game' && storage) {
      const scenarioId = screen.scenarioId;
      const isDynamic = scenarioId.startsWith('scen_dynamic_');

      const setupAndStart = async () => {
        let aiProvider: AiProvider | null = null;
        if (isDynamic) {
          aiProvider = await resolveAiProvider(storage, (progress, text) => {
            setDownloadModal({ isOpen: true, progress, text });
          });
          if (aiProvider.id === 'webllm' && 'initialize' in aiProvider) {
            try {
              await (aiProvider as any).initialize();
            } finally {
              setDownloadModal(null);
            }
          }
        }

        const scenario = await loadScenario(scenarioId);
        const controller = new GameController({
          storage,
          aiProvider,
          locale: currentLocale.value,
          audio: (event) => play(event as any),
          haptics: (pattern) => haptic(pattern),
          onNavigate: (s, payload) => {
            if (s === 'debrief' && payload) {
              navigateTo({ name: 'debrief', runId: payload });
            } else if (s === 'home') {
              navigateTo({ name: 'home' });
            }
          },
        });
        const seed = Date.now();
        const runId = `run-${Date.now()}`;
        await controller.start(scenario, seed, runId);
        setActiveGame({ controller, scenario });
      };

      setupAndStart().catch(console.error);
    } else if (screen.name !== 'game' && activeGame) {
      activeGame.controller.destroy();
      setActiveGame(null);
    }
  }, [screen, storage]);

  const handleGameLeave = () => {
    navigateTo({ name: 'home' });
  };

  const renderScreen = () => {
    switch (screen.name) {
      case 'home':
        return <HomeScreen storage={storage} />;
      case 'briefing':
        return <BriefingScreen scenarioId={screen.scenarioId} />;
      case 'game':
        if (!activeGame) {
          return (
            <div class="briefing-screen briefing-screen--loading">
              <p>Loading...</p>
            </div>
          );
        }
        return (
          <GameScreen
            controller={activeGame.controller}
            scenario={activeGame.scenario}
            onLeave={handleGameLeave}
          />
        );
      case 'debrief':
        return storage ? <DebriefScreen runId={screen.runId} storage={storage} /> : null;
      case 'settings':
        return storage ? <SettingsScreen storage={storage} /> : null;
      case 'stats':
        return storage ? <StatsScreen storage={storage} /> : null;
      case 'howto':
      case 'onboarding':
        return <HowToScreen />;
      default:
        return <HomeScreen storage={storage} />;
    }
  };

  const isGame = screen.name === 'game';

  return (
    <main class={`app-shell ${isGame ? 'app-shell--game' : ''}`}>
      {needRefresh.value && !isGame && (
        <aside class="pwa-update-banner" role="status" aria-live="polite">
          <span>{t('update.available')}</span>
          <button type="button" class="pwa-update-btn" onClick={applyUpdate}>
            {t('update.apply')}
          </button>
        </aside>
      )}

      {downloadModal && (
        <ModelProgressModal
          isOpen={downloadModal.isOpen}
          progress={downloadModal.progress}
          text={downloadModal.text}
          onCancel={() => {
            setDownloadModal(null);
            navigateTo({ name: 'home' });
          }}
        />
      )}

      {renderScreen()}

      {!isGame && (
        <footer class="app-footer">
          <a
            href="https://github.com/sponsors/ghajba"
            target="_blank"
            rel="noopener noreferrer"
            class="sponsor-button"
            aria-label="Sponsor on GitHub"
          >
            <svg
              class="sponsor-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span>Sponsor on GitHub</span>
          </a>
        </footer>
      )}
    </main>
  );
}
