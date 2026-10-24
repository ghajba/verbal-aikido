import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameController } from '../../app/gameController';
import type { Card as CardType, Scenario } from '../../content/types';
import { interpolate, pick } from '../../engine/interpolate';
import { getMuted, setMuted } from '../../feedback/audio';
import { currentLocale, t } from '../../i18n/locale';
import { CardHand } from '../components/CardHand';
import { DropZone } from '../components/DropZone';
import { LiveRegion } from '../components/LiveRegion';
import { MeterBar } from '../components/MeterBar';
import { NpcBubble } from '../components/NpcBubble';
import { TimerRing } from '../components/TimerRing';
import { KEY_HINTS } from '../keyHints';
import { navigateTo } from '../router';
import '../styles/game.css';

export interface GameScreenProps {
  controller: GameController;
  scenario?: Scenario;
  onLeave?: () => void;
}

export function GameScreen({ controller, scenario: propScenario, onLeave }: GameScreenProps) {
  const scenario = controller.getScenario() ?? propScenario;
  const runState = controller.runState.value;
  const isTransitioning = controller.isTransitioning.value;

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => getMuted());
  const [canContinue, setCanContinue] = useState<boolean>(false);
  const [politeAnnouncement, setPoliteAnnouncement] = useState<string>('');
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState<string>('');

  const prevMetricsRef = useRef<{ E: number; F: number; K: number } | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  // Pool of all cards in scenario (re-evaluated when node or turn changes in dynamic scenarios)
  const allCards = useMemo(
    () => (controller.getScenario() ?? scenario)?.nodes.flatMap((n) => n.availableCards) ?? [],
    [scenario, runState?.currentNodeId, runState?.turnIndex, runState?.hand]
  );

  const currentNode = (controller.getScenario() ?? scenario)?.nodes.find(
    (n) => n.nodeId === runState?.currentNodeId
  );

  // Monitor meter changes and trigger screen-reader announcement per SBE-MTR-004
  useEffect(() => {
    if (!runState) return;

    const currentE = runState.metrics.escalation;
    const currentF = runState.metrics.grounding;
    const currentK = runState.metrics.confusion;

    if (prevMetricsRef.current) {
      const prev = prevMetricsRef.current;
      if (currentE !== prev.E) {
        setPoliteAnnouncement(
          t('meter.announce', {
            meter: t('meter.E'),
            to: currentE,
            from: prev.E,
          })
        );
      } else if (currentF !== prev.F) {
        setPoliteAnnouncement(
          t('meter.announce', {
            meter: t('meter.F'),
            to: currentF,
            from: prev.F,
          })
        );
      } else if (currentK !== prev.K) {
        setPoliteAnnouncement(
          t('meter.announce', {
            meter: t('meter.K'),
            to: currentK,
            from: prev.K,
          })
        );
      }
    }

    prevMetricsRef.current = { E: currentE, F: currentF, K: currentK };
  }, [runState?.metrics.escalation, runState?.metrics.grounding, runState?.metrics.confusion]);

  // Phase transition side-effects
  useEffect(() => {
    if (!runState) return;
    const phase = runState.phase;

    let timer: number | null = null;
    if (phase !== prevPhaseRef.current) {
      // Auto-close preview if phase is not INTERVENTION_CHOICE (e.g. SBE-TMR-006 timeout)
      if (phase !== 'INTERVENTION_CHOICE') {
        setSelectedCardId(null);
      }

      // Input lock 250ms for "Tovább" per Section 16.5
      if (phase === 'OUTCOME_CHECK') {
        setCanContinue(false);
        timer = window.setTimeout(() => {
          setCanContinue(true);
        }, 250);
      } else {
        setCanContinue(false);
      }

      prevPhaseRef.current = phase;
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [runState?.phase]);

  // 5-second timer warning assertion
  useEffect(() => {
    if (runState?.phase === 'INTERVENTION_CHOICE') {
      const rem = runState.timing.timerRemainingMs;
      if (rem !== null && rem <= 5000 && rem > 0) {
        setAssertiveAnnouncement(t('timer.fiveSeconds'));
      }
    }
  }, [runState?.timing.timerRemainingMs]);

  // Global Keyboard Navigation per Section 16.2 & SBE-CRD-007, 008, 011
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (leaveDialogOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setLeaveDialogOpen(false);
        }
        return;
      }

      const state = controller.runState.value;
      if (!state) return;

      if (state.phase === 'INTERVENTION_CHOICE' && !controller.isTransitioning.value) {
        if (e.key === '1' && state.hand[0]) {
          setSelectedCardId(state.hand[0]);
        } else if (e.key === '2' && state.hand[1]) {
          setSelectedCardId(state.hand[1]);
        } else if (e.key === '3' && state.hand[2]) {
          setSelectedCardId(state.hand[2]);
        } else if (e.key === 'Enter') {
          if (selectedCardId && state.hand.includes(selectedCardId)) {
            controller.commitCard(selectedCardId);
            setSelectedCardId(null);
          }
        } else if (e.key === 'Escape') {
          setSelectedCardId(null);
        }
      } else if (state.phase === 'OUTCOME_CHECK') {
        if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          if (canContinue) {
            controller.continueNext();
          }
        }
      } else if (state.phase === 'ENDED') {
        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
          e.preventDefault();
          if (state.runId) {
            navigateTo({ name: 'debrief', runId: state.runId });
          } else {
            onLeave?.();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leaveDialogOpen, selectedCardId, canContinue, controller]);

  // Handle browser popstate (back button) -> open leave confirm per Section 16.1
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      setLeaveDialogOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (!scenario || !runState) {
    return null;
  }

  // Cards in hand
  const currentHandCards = useMemo(
    () =>
      (runState.hand ?? [])
        .map((id) => allCards.find((c) => c.cardId === id))
        .filter((c): c is CardType => c !== undefined),
    [allCards, runState.hand]
  );

  // Last committed card and its reaction
  const lastTurn = runState.history[runState.history.length - 1];
  const committedCard =
    (runState.phase === 'RESOLUTION_PHASE' ||
      runState.phase === 'OUTCOME_CHECK' ||
      runState.phase === 'ENDED') &&
    lastTurn
      ? allCards.find((c) => c.cardId === lastTurn.cardId)
      : null;

  const reactionText =
    committedCard && currentNode
      ? interpolate(
          committedCard.npcReaction,
          currentLocale.value,
          { npc: scenario.npc, variables: scenario.variables },
          { variables: currentNode.variables }
        )
      : null;

  const npcStatementText = currentNode
    ? interpolate(
        currentNode.npcStatement,
        currentLocale.value,
        { npc: scenario.npc, variables: scenario.variables },
        { variables: currentNode.variables }
      )
    : '';

  const handleToggleMute = () => {
    const next = !isAudioMuted;
    setMuted(next);
    setIsAudioMuted(next);
  };

  const handleApplyCommit = () => {
    if (selectedCardId && runState.phase === 'INTERVENTION_CHOICE') {
      controller.commitCard(selectedCardId);
      setSelectedCardId(null);
    }
  };

  const handleUpperZoneClick = () => {
    if (runState.phase === 'ATTACK_INCOMING') {
      controller.skipReveal();
    }
  };

  const handleConfirmLater = async () => {
    setLeaveDialogOpen(false);
    await controller.suspend();
    onLeave?.();
  };

  const handleConfirmGiveUp = async () => {
    setLeaveDialogOpen(false);
    await controller.abandon();
    onLeave?.();
  };

  const isOutcomeCheck = runState.phase === 'OUTCOME_CHECK';
  const isIntervention = runState.phase === 'INTERVENTION_CHOICE';

  return (
    <div class="game-screen" data-testid="game-screen">
      <LiveRegion politeMessage={politeAnnouncement} assertiveMessage={assertiveAnnouncement} />

      {/* Header 48px */}
      <header class="game-header">
        <button
          type="button"
          class="game-header__leave-btn"
          onClick={() => setLeaveDialogOpen(true)}
          aria-label={t('game.leaveConfirm')}
          data-testid="header-leave-btn"
        >
          ✕
        </button>

        <h1 class="game-header__title">{pick(scenario.title, currentLocale.value)}</h1>

        <div class="game-header__right">
          <span class="game-header__turn" data-testid="game-turn-counter">
            {t('game.turn', { n: runState.turnIndex + 1 })} / ≤7
          </span>

          <button
            type="button"
            class="game-header__mute-btn"
            onClick={handleToggleMute}
            aria-label={isAudioMuted ? 'Unmute' : 'Mute'}
            data-testid="mute-toggle-btn"
          >
            {isAudioMuted ? (
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Upper Zone (Scrollable Top 60%) */}
      <section class="game-upper-zone" onClick={handleUpperZoneClick} data-testid="game-upper-zone">
        <div class="meters-block">
          <MeterBar
            metric="E"
            label={t('meter.E')}
            value={runState.metrics.escalation}
            previousValue={prevMetricsRef.current?.E}
          />
          <MeterBar
            metric="F"
            label={t('meter.F')}
            value={runState.metrics.grounding}
            previousValue={prevMetricsRef.current?.F}
          />
          <MeterBar
            metric="K"
            label={t('meter.K')}
            value={runState.metrics.confusion}
            previousValue={prevMetricsRef.current?.K}
          />
        </div>

        {currentNode && (
          <NpcBubble
            npcName={pick(scenario.npc.name, currentLocale.value)}
            npcRole={pick(scenario.npc.role, currentLocale.value)}
            tone={currentNode.tone}
            statement={npcStatementText}
            reaction={reactionText}
            isRevealing={runState.phase === 'ATTACK_INCOMING'}
            onSkipReveal={() => controller.skipReveal()}
          />
        )}
      </section>

      {/* Bottom Zone (Fixed 40dvh) */}
      <section class="game-bottom-zone" data-testid="game-bottom-zone">
        <div class="game-bottom-zone__top-row">
          <DropZone
            committedCard={committedCard}
            scenarioNpc={scenario.npc}
            scenarioVariables={scenario.variables}
            nodeVariables={currentNode?.variables}
          />

          <TimerRing
            remainingMs={runState.timing.timerRemainingMs}
            totalLimitSec={scenario.decisionTimeLimitSec}
          />
        </div>

        <CardHand
          cards={currentHandCards}
          selectedCardId={selectedCardId}
          committedCardId={committedCard?.cardId ?? null}
          isTransitioning={isTransitioning}
          onSelectCard={(id) => setSelectedCardId(id)}
          onCommitCard={(id) => controller.commitCard(id)}
          onCancelPreview={() => setSelectedCardId(null)}
          scenarioNpc={scenario.npc}
          scenarioVariables={scenario.variables}
          nodeVariables={currentNode?.variables}
        />

        {/* Primary Action Button */}
        {runState.phase === 'ENDED' ? (
          <button
            type="button"
            class="game-primary-btn game-primary-btn--continue"
            onClick={() => {
              if (runState.runId) {
                navigateTo({ name: 'debrief', runId: runState.runId });
              } else {
                onLeave?.();
              }
            }}
            data-testid="primary-debrief-btn"
          >
            <span>{t('debrief.title')}</span>
          </button>
        ) : isOutcomeCheck ? (
          <button
            type="button"
            class="game-primary-btn game-primary-btn--continue"
            onClick={() => {
              if (canContinue) controller.continueNext();
            }}
            disabled={!canContinue}
            data-testid="primary-continue-btn"
          >
            <span>{t('common.next')}</span>
            <span class="key-hint" aria-hidden="true">
              {KEY_HINTS.continue}
            </span>
          </button>
        ) : (
          <button
            type="button"
            class="game-primary-btn game-primary-btn--apply"
            onClick={handleApplyCommit}
            disabled={!selectedCardId || isTransitioning || !isIntervention}
            data-testid="primary-apply-btn"
          >
            <span>{t('game.apply')}</span>
            <span class="key-hint" aria-hidden="true">
              {KEY_HINTS.apply}
            </span>
          </button>
        )}
      </section>

      {/* Leave Confirm Dialog */}
      {leaveDialogOpen && (
        <div
          class="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-leave-title"
          data-testid="leave-confirm-dialog"
        >
          <div class="dialog-box">
            <h2 id="dialog-leave-title" class="dialog-box__title">
              {t('game.leaveConfirm')}
            </h2>

            <div class="dialog-buttons">
              <button
                type="button"
                class="dialog-btn dialog-btn--later"
                onClick={handleConfirmLater}
                data-testid="leave-later-btn"
              >
                {t('game.later')}
              </button>

              <button
                type="button"
                class="dialog-btn dialog-btn--giveup"
                onClick={handleConfirmGiveUp}
                data-testid="leave-giveup-btn"
              >
                {t('game.giveUp')}
              </button>

              <button
                type="button"
                class="dialog-btn dialog-btn--cancel"
                onClick={() => setLeaveDialogOpen(false)}
                data-testid="leave-cancel-btn"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
