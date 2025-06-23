'use client'

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";

import { contractAddress, contractAbi } from '@/constants';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { publicClient } from '@/utils/client';
import { parseAbiItem } from 'viem';

import { ExclamationTriangleIcon } from "@radix-ui/react-icons"
import { CheckCircle2Icon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const VotingSession = () => {
  const [proposals, setProposals] = useState([]);
  const [isVoter, setIsVoter] = useState(false);
  const [voterInfo, setVoterInfo] = useState(null);
  const [voterCheckLoading, setVoterCheckLoading] = useState(true);
  
  const { address } = useAccount();
  
  // Lire le statut du workflow
  const { data: workflowStatus } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'workflowStatus',
  });

  // Lire le propriétaire du contrat
  const { data: owner } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'owner',
  });

  // Hook pour écrire dans le contrat
  const { writeContract, data: hash, isPending } = useWriteContract();

  // Attendre la confirmation de la transaction
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Fonction pour vérifier si l'utilisateur est un électeur
  const checkVoterStatus = async () => {
    if (!address || !contractAddress) {
      setVoterCheckLoading(false);
      return;
    }
    
    setVoterCheckLoading(true);
    try {
      const voterData = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getVoter',
        args: [address]
      });
      
      setVoterInfo(voterData);
      setIsVoter(voterData.isRegistered === true);
    } catch (error) {
      setIsVoter(false);
      setVoterInfo(null);
    } finally {
      setVoterCheckLoading(false);
    }
  };

  // Fonction pour charger les propositions
  const loadProposals = async () => {
    if (!contractAddress) return;
    
    try {
      const proposalDetails = [];
      
      // Charger GENESIS
      try {
        const genesisProposal = await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: 'getOneProposal',
          args: [0]
        });
        proposalDetails.push({ id: 0, ...genesisProposal });
      } catch (error) {
        // GENESIS pas encore créée
      }

      // Charger les autres propositions
      try {
        const logs = await publicClient.getLogs({
          address: contractAddress,
          event: parseAbiItem('event ProposalRegistered(uint proposalId)'),
          fromBlock: 0n,
          toBlock: 'latest'
        });
        
        for (const log of logs) {
          const proposalId = Number(log.args.proposalId);
          try {
            const proposal = await publicClient.readContract({
              address: contractAddress,
              abi: contractAbi,
              functionName: 'getOneProposal',
              args: [proposalId]
            });
            proposalDetails.push({ id: proposalId, ...proposal });
          } catch (error) {
            // Ignorer
          }
        }
      } catch (error) {
        console.error('Erreur événements:', error);
      }
      
      setProposals(proposalDetails);
    } catch (error) {
      console.error('Erreur chargement propositions:', error);
    }
  };

  // Charger au démarrage
  useEffect(() => {
    loadProposals();
  }, [contractAddress]);

  // Vérifier le statut électeur
  useEffect(() => {
    checkVoterStatus();
  }, [address, contractAddress]);

  // Recharger après transaction
  useEffect(() => {
    if (isSuccess) {
      // Attendre un peu pour que la transaction soit confirmée sur la blockchain
      setTimeout(() => {
        refreshData();
      }, 1000);
    }
  }, [isSuccess]);

  const vote = async (proposalId) => {
    try {
      await writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'setVote',
        args: [proposalId],
      });
    } catch (error) {
      console.error('Erreur vote:', error);
    }
  };

  const refreshData = async () => {
    await Promise.all([
      loadProposals(),
      checkVoterStatus()
    ]);
  };

  const endVotingSession = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'endVotingSession',
    });
  };

  const canVote = workflowStatus === 3;
  const hasVoted = voterInfo?.hasVoted;
  const votedProposalId = voterInfo?.votedProposalId;
  const isOwner = address === owner;

  return (
    <div className="space-y-4 p-4 border rounded">
      <h2 className="text-xl font-bold">Session de Vote</h2>
      
      <div>
        <p>Statut: {canVote ? 'Ouvert' : 'Fermé'}</p>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Électeur enregistré: {voterCheckLoading ? '⏳ Vérification...' : isVoter ? '✅ Oui' : '❌ Non'}
          </p>
        </div>
        
        <p className="text-xs text-gray-500 mt-1">
          Contrat: <code>{contractAddress}</code>
        </p>
      </div>

      {/* Message pour non-électeurs */}
      {!isVoter && !voterCheckLoading && (

        <Alert variant="default | destructive">
            <ExclamationTriangleIcon className=" text-red-900 h-4 w-4" />
            <AlertDescription>
                <p className="text-sm text-red-700">
                Seuls les électeurs enregistrés peuvent voter
                </p>
            </AlertDescription>
        </Alert>
      )}

      {/* Message pour électeurs ayant déjà voté */}
      {isVoter && hasVoted && (
        <Alert>
              <CheckCircle2Icon className=" text-green-600 h-4 w-4"/>
                <AlertDescription>
                ✅ Vous avez déjà voté pour la proposition #{Number(votedProposalId)}
              </AlertDescription>
        </Alert>
      )}

      {/* Liste des propositions avec boutons de vote */}
      <div>
        <h3 className="font-semibold">Propositions ({proposals.length})</h3>
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <div key={proposal.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border text-gray-700">
              <div className="flex-1">
                <div className="font-medium">#{proposal.id}: {proposal.description}</div>
                <div className="text-sm text-gray-600">
                  {hasVoted && Number(votedProposalId) === proposal.id && (
                    <span className="text-green-600 font-medium">← Votre vote</span>
                  )}
                </div>
              </div>
              
              {/* Bouton de vote */}
              {isVoter && canVote && !hasVoted && (
                <Button
                  onClick={() => vote(proposal.id)}
                  disabled={isPending || isConfirming}
                  variant="outline"
                  size="sm"
                  className="ml-3"
                >
                  {isPending || isConfirming ? '⏳' : '➕ Voter'}
                </Button>
              )}
              
              {/* Indication si déjà voté pour cette proposition */}
              {hasVoted && Number(votedProposalId) === proposal.id && (
                <div className="ml-3 text-green-600 font-medium">
                  ✅ Votre choix
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bouton pour fermer le vote (owner seulement) */}
      {canVote && (
        <div className="pt-4 border-t">
          {!isOwner ? (
            <Alert variant="default | destructive">
              <ExclamationTriangleIcon className=" text-red-900 h-4 w-4" />
               <AlertDescription>
                Seul le propriétaire peut fermer la session de vote
               </AlertDescription>
            </Alert>
          ) : (
            <>
              <Button 
                onClick={endVotingSession}
                disabled={isPending || isConfirming}
                variant="destructive"
                className="w-full"
              >
                {isPending ? 'Envoi...' : isConfirming ? 'Confirmation...' : 'Mettre fin au vote'}
              </Button>
              <p className="text-sm text-gray-600 mt-2 text-center">
                Fermer définitivement la session de vote et décompter les résultats
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VotingSession;