'use client'

import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input"; 
import { Button } from "@/components/ui/button";

import { contractAddress, contractAbi } from '@/constants';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { publicClient } from '@/utils/client';
import { parseAbiItem } from 'viem';

import { ExclamationTriangleIcon } from "@radix-ui/react-icons"
import { CheckCircle2Icon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const ProposalRegistration = () => {
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposals, setProposals] = useState([]);
  const [isVoter, setIsVoter] = useState(false);
  const [voterCheckLoading, setVoterCheckLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastAction, setLastAction] = useState(''); // Pour différencier les actions
  
  const { address } = useAccount();
  
  // Lire le propriétaire du contrat
  const { data: owner } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'owner',
  });

  // Lire le statut du workflow avec refetch
  const { data: workflowStatus, refetch: refetchWorkflow } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'workflowStatus',
  });

  // Hook pour écrire dans le contrat
  const { writeContract, data: hash, isPending } = useWriteContract();

  // Attendre la confirmation de la transaction
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Fonction pour décoder les erreurs personnalisées
  const parseContractError = (error) => {
    const errorStr = error.message || '';
    const causeStr = error.cause?.message || '';
    
    if (errorStr.includes('InvalidWorkflowStatus') || causeStr.includes('InvalidWorkflowStatus')) {
      return 'Impossible de fermer les propositions dans cette phase';
    }
    
    if (errorStr.includes('OwnableUnauthorizedAccount') || causeStr.includes('OwnableUnauthorizedAccount')) {
      return 'Seul le propriétaire peut fermer l\'enregistrement des propositions';
    }
    
    if (errorStr.includes('User rejected') || errorStr.includes('user rejected')) {
      return 'Transaction annulée par l\'utilisateur';
    }
    
    if (error.cause?.name === 'ContractFunctionRevertedError' || errorStr.includes('reverted')) {
      return 'Transaction rejetée par le contrat';
    }
    
    return 'Erreur lors de l\'envoi de la transaction';
  };

  // Fonction pour vérifier si l'utilisateur est un électeur
  const checkVoterStatus = async () => {
    if (!address || !contractAddress) {
      setVoterCheckLoading(false);
      return;
    }
    
    setVoterCheckLoading(true);
    try {
      const voterInfo = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getVoter',
        args: [address]
      });
      
      setIsVoter(voterInfo.isRegistered === true);
    } catch (error) {
      setIsVoter(false);
    } finally {
      setVoterCheckLoading(false);
    }
  };

  // Fonction pour charger les propositions
  const loadProposals = async () => {
    if (!contractAddress) return;
    
    try {
      const proposalDetails = [];
      
      // Charger GENESIS  (BLANKVOTE)
      try {
        const genesisProposal = await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: 'getOneProposal',
          args: [0]
        });
        proposalDetails.push({ id: 0, ...genesisProposal });
      } catch (error) {
        // GENESIS (BLANKVOTE) pas encore créée
      }

      // Charger les autres propositions
      try {
        const logs = await publicClient.getLogs({
          address: contractAddress,
          event: parseAbiItem('event ProposalRegistered(uint proposalId)'),
          fromBlock: BigInt(8612269),
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
  }, [address, contractAddress, workflowStatus]);

  // Gestion différenciée des transactions réussies
  useEffect(() => {
    if (isSuccess) {
      if (lastAction === 'addProposal') {
        // Pour l'ajout de proposition : juste recharger les données
        setProposalDescription('');
        setSuccess('Proposition ajoutée avec succès !');
        loadProposals();
        checkVoterStatus();
        setTimeout(() => setSuccess(''), 3000);
      } else if (lastAction === 'endProposals') {
        // Pour la fermeture : recharger le workflow puis la page
        setSuccess('Propositions fermées ! Redirection...');
        refetchWorkflow()
      }
      
      setLastAction('');
    }
  }, [isSuccess, lastAction, refetchWorkflow]);

  const addProposal = async () => {
    if (!proposalDescription.trim()) return;
    
    setError('');
    setSuccess('');
    setLastAction('addProposal'); // Marquer l'action
    
    try {
      await writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'addProposal',
        args: [proposalDescription],
      });
    } catch (error) {
      console.error('Erreur ajout proposition:', error);
      setError('Erreur lors de l\'ajout de la proposition');
    }
  };

  const endProposalsRegistration = async () => {
    setError('');
    setSuccess('');
    setLastAction('endProposals'); // Marquer l'action
    
    try {
      await publicClient.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'endProposalsRegistering',
        account: address,
      });
    } catch (simulationError) {
      const errorMessage = parseContractError(simulationError);
      setError(errorMessage);
      return;
    }
    
    try {
      await writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'endProposalsRegistering',
      });
    } catch (error) {
      const errorMessage = parseContractError(error);
      setError(errorMessage);
    }
  };

  const startVotingSession = async () => {
    try {
      await writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'startVotingSession',
      });
    } catch (error) {
      console.error('Erreur démarrage vote:', error);
    }
  };

  const forceRefresh = async () => {
    await checkVoterStatus();
    loadProposals();
  };

  const canAddProposals = workflowStatus === 1;
  const hasRealProposals = proposals.length > 1;
  const isOwner = address === owner;

  return (
    <div className="space-y-4 p-4 border rounded">
      <h2 className="text-xl font-bold">Enregistrement des Propositions</h2>
      
      <div>
        <p>Statut: {canAddProposals ? 'Ouvert' : 'Fermé'}</p>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Électeur enregistré: {voterCheckLoading ? '⏳ Vérification...' : isVoter ? '✅ Oui' : '❌ Non'}
          </p>
          <Button 
            onClick={forceRefresh}
            variant="outline" 
            size="sm"
            disabled={voterCheckLoading}
            className="p-2 m-2"
          >
            Actualiser
          </Button>
        </div>
        
        
        {!isVoter && !voterCheckLoading && (
          <Alert variant="default | destructive">
              <ExclamationTriangleIcon className=" text-red-900 h-4 w-4" />
              <AlertTitle className="text-red-700">WARNING !</AlertTitle>
              <AlertDescription>
                  <p className="text-sm text-red-700">
                  Cette adresse n'est pas enregistrée comme électeur
                  </p>
              </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Contrat: <code>{contractAddress}</code>
        </p>
      </div>

      {/* Message pour non-électeurs */}
      {!isVoter && canAddProposals && (
        <Alert variant="default | destructive">
            <ExclamationTriangleIcon className=" text-red-900 h-4 w-4" />
            <AlertDescription>
                <p className="text-sm text-red-700">
                Seuls les électeurs enregistrés peuvent ajouter des propositions
                </p>
            </AlertDescription>
        </Alert>
      )}

      {/* Formulaire pour électeurs */}
      {isVoter && canAddProposals && (
        <div className="space-y-2 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-green-800 text-sm font-medium">
            Vous pouvez ajouter une proposition
          </p>
          <Input
            type="text"
            placeholder="Description de votre proposition"
            value={proposalDescription}
            onChange={(e) => setProposalDescription(e.target.value)}
            className="text-black"
          />
          
          <Button 
            onClick={addProposal}
            disabled={isPending || isConfirming || !proposalDescription.trim()}
            className="w-full bg-green-600 hover:bg-green-500"
          >
            {isPending ? 'Envoi...' : isConfirming ? 'Confirmation...' : 'Ajouter Proposition'}
          </Button>
        </div>
      )}

      {/* Messages de succès/erreur globaux - POUR TOUS LES UTILISATEURS */}
      {error && (
        <Alert variant="default | destructive">
          <ExclamationTriangleIcon className=" text-red-900 h-4 w-4" />
          <AlertTitle className="text-red-900">WARNING !</AlertTitle>
          <AlertDescription>
            ❌ {error}
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle2Icon className=" text-green-600 h-4 w-4"/>
          <AlertTitle className="text-green-600">SUCCESS !</AlertTitle>
          <AlertDescription>
           ✅ {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Liste des propositions */}
      <div>
        <h3 className="font-semibold">Propositions Enregistrées ({proposals.length})</h3>
        <div className=" overflow-y-auto space-y-2">
          {proposals.map((proposal, index) => (
            <div key={index} className="text-sm bg-gray-100 p-2 rounded text-gray-700">
              <div className="font-medium">#{proposal.id}: {proposal.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bouton pour fermer les propositions (phase 1) */}
      {canAddProposals && hasRealProposals && (
        <div className="pt-4 border-t space-y-2">
          {!isOwner ? (
            <Alert variant="default | destructive">
                <ExclamationTriangleIcon className=" text-red-900 h-4 w-4" />
                <AlertDescription>
                <p className="text-sm text-red-700">
                Seul le propriétaire peut fermer l'enregistrement des propositions
                </p>
                </AlertDescription>
            </Alert>
          ) : (
            <Button 
              onClick={endProposalsRegistration}
              disabled={isPending || isConfirming}
              variant="destructive"
              className="w-full"
            >
              {isPending ? 'Envoi...' : isConfirming ? 'Confirmation...' : 'Fermer l\'enregistrement des propositions'}
            </Button>
          )}
        </div>
      )}

      {/* Bouton pour démarrer le vote (phase 2) */}
      {workflowStatus === 2 && hasRealProposals && (
        <div className="pt-4 border-t">
          {!isOwner ? (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-yellow-800 text-sm">
                ⚠️ Seul le propriétaire peut démarrer la session de vote
              </p>
            </div>
          ) : (
            <>
              <Button 
                onClick={startVotingSession}
                disabled={isPending || isConfirming}
                className="w-full"
              >
                {isPending ? 'Envoi...' : isConfirming ? 'Confirmation...' : 'Démarrer la session de vote'}
              </Button>
              <p className="text-sm text-gray-600 mt-2 text-center">
                Lancer la phase de vote pour toutes les propositions
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProposalRegistration;