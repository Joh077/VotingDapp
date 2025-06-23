'use client'

import { useEffect } from 'react';
import NotConnected from "@/components/shared/NotConnected";
import VoterRegistration from "@/components/shared/VoterRegistration";
import ProposalRegistration from "@/components/shared/ProposalRegistration";
import VotingSession from "@/components/shared/VotingSession";
import VotingEnded from "@/components/shared/VotingEnded";
import VotesTallied from "@/components/shared/VotesTallied";

import { useAccount, useReadContract } from "wagmi";
import { contractAddress, contractAbi } from '@/constants';

export default function Home() {
  const { isConnected } = useAccount();

  // Lire le statut du workflow avec refetch
  const { data: workflowStatus, refetch: refetchWorkflowStatus } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'workflowStatus',
  });

  // Recharger périodiquement le statut
  useEffect(() => {
    const interval = setInterval(() => {
      refetchWorkflowStatus();
    }, 2000); // Vérifier toutes les 2 secondes

    return () => clearInterval(interval);
  }, [refetchWorkflowStatus]);

  const isVoterRegistrationOpen = workflowStatus === 0;
  const isProposalRegistrationOpen = workflowStatus === 1;
  const isProposalRegistrationClosed = workflowStatus === 2;
  const isVotingSessionOpen = workflowStatus === 3;
  const isVotingSessionEnded = workflowStatus === 4;
  const isVotesTallied = workflowStatus === 5;

  return ( 
    <>
    {isConnected ? (
      <div className="space-y-6">
        {/* Composant VoterRegistration - seulement en phases 0, 1, 2 */}
        {(workflowStatus === 0 || workflowStatus === 1 || workflowStatus === 2) && (
          <div className={workflowStatus !== 0 ? 'opacity-50 pointer-events-none' : ''}>
            <VoterRegistration />
          </div>
        )}

        {/* Composant ProposalRegistration - affiché si ouvert ou fermé */}
        {(isProposalRegistrationOpen || isProposalRegistrationClosed) && (
          <div>
            <ProposalRegistration />
            {/* Debug pour voir le workflow status */}
            {/* <div className="mt-2 p-2 bg-gray-100 text-xs rounded">
              Debug page.js: workflowStatus = {workflowStatus} | Phase 2 = {isProposalRegistrationClosed.toString()}
            </div> */}
          </div>
        )}

        {/* Composant VotingSession - affiché seulement si ouvert */}
        {isVotingSessionOpen && (
          <VotingSession />
        )}

        {/* Composant pour phase 4 (décompte des votes) */}
        {isVotingSessionEnded && (
          <VotingEnded />
        )}

        {/* Composant VotesTallied - résultats finaux */}
        {isVotesTallied && (
          <VotesTallied />
        )}
      </div>
    ) : (
      <NotConnected />
    )}
    </>
  );
}