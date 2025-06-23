'use client'

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";

import { contractAddress, contractAbi } from '@/constants';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { publicClient } from '@/utils/client';
import { parseAbiItem } from 'viem';

const VotesTallied = () => {
  const [proposals, setProposals] = useState([]);
  const [winner, setWinner] = useState(null);
  
  const { address } = useAccount();
  
  // Lire les données du contrat
  const { data: workflowStatus } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'workflowStatus',
  });

  const { data: winningProposalID } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'winningProposalID',
  });

  const { data: maxVotes } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'maxVotes',
  });

  // Fonction pour charger les propositions avec leurs votes
  const loadProposalsWithVotes = async () => {
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
      
      // Trier par nombre de votes (décroissant)
      const sortedProposals = proposalDetails.sort((a, b) => Number(b.voteCount) - Number(a.voteCount));
      setProposals(sortedProposals);

      // Trouver le gagnant
      if (winningProposalID !== undefined && sortedProposals.length > 0) {
        const winningProposal = sortedProposals.find(p => p.id === Number(winningProposalID));
        setWinner(winningProposal || null);
      } else {
        setWinner(null);
      }
      
    } catch (error) {
      console.error('Erreur chargement propositions:', error);
    }
  };

  // Charger au démarrage et quand les données changent
  useEffect(() => {
    loadProposalsWithVotes();
  }, [contractAddress, winningProposalID, maxVotes, workflowStatus]);

  const totalVotes = proposals.reduce((sum, proposal) => sum + Number(proposal.voteCount), 0);

  return (
    <div className="space-y-6 p-6 border rounded-lg bg-gradient-to-br from-green-50 to-blue-50">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">🏆 Résultats du Vote</h2>
        <p className="text-gray-600">Le vote est terminé et les résultats ont été décomptés</p>
      </div>

      {/* Gagnant */}
      {winner && (
        <div className="bg-yellow-100 border-2 border-yellow-300 rounded-lg p-6 text-center">
          <div className="text-2xl mb-2">🥇</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Proposition Gagnante</h3>
          <div className="text-lg font-semibold text-green-700">
            #{winner.id}: {winner.description}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            {Number(winner.voteCount)} votes sur {totalVotes} votes totaux
            {totalVotes > 0 && (
              <span className="ml-2">
                ({Math.round((Number(winner.voteCount) / totalVotes) * 100)}%)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Classement complet */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Classement Complet</h3>
        <div className="space-y-2">
          {proposals.map((proposal, index) => (
            <div 
              key={proposal.id} 
              className={`flex items-center justify-between p-3 rounded border text-black ${
                proposal.id === Number(winningProposalID) 
                  ? 'bg-yellow-50 border-yellow-300 font-semibold' 
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="text-lg">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                </div>
                <div>
                  <div className="font-medium">
                    #{proposal.id}: {proposal.description}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-lg">
                  {Number(proposal.voteCount)} votes
                </div>
                {totalVotes > 0 && (
                  <div className="text-xs text-gray-500">
                    {Math.round((Number(proposal.voteCount) / totalVotes) * 100)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistiques */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-2">📈 Statistiques</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Total des votes:</span>
            <span className="ml-2 font-semibold text-gray-700">{totalVotes}</span>
          </div>
          <div>
            <span className="text-gray-600">Propositions:</span>
            <span className="ml-2 font-semibold text-gray-700">{proposals.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Proposition gagnante:</span>
            <span className="ml-2 font-semibold text-gray-700">#{winningProposalID !== undefined ? Number(winningProposalID) : '-'}</span>
          </div>
          <div>
            <span className="text-gray-600">Votes maximum:</span>
            <span className="ml-2 font-semibold text-gray-700">{maxVotes !== undefined ? Number(maxVotes) : '-'}</span>
          </div>
        </div>
      </div>

      <div className="text-center text-sm text-gray-500">
        <p>✅ Vote terminé - Résultats définitifs</p>
        <p className="text-xs mt-1">Contrat: <code>{contractAddress}</code></p>
      </div>
    </div>
  );
};

export default VotesTallied;