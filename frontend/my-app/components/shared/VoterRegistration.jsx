'use client'

import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input"; 
import { Button } from "@/components/ui/button";

import { contractAddress, contractAbi } from '@/constants';
import { useReadContract, useBalance, useAccount, useWriteContract, useWaitForTransactionReceipt, useSimulateContract } from 'wagmi';
import { publicClient } from '@/utils/client';
import { parseAbiItem, parseEther, formatEther, decodeErrorResult, getContract } from 'viem';

import { ExclamationTriangleIcon } from "@radix-ui/react-icons"
import { CheckCircle2Icon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"


const VoterRegistration = () => {
  const [voterAddress, setVoterAddress] = useState('');
  const [registeredVoters, setRegisteredVoters] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastAction, setLastAction] = useState(''); // 'addVoter' ou 'startProposals'
  
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
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

  // Attendre la confirmation de la transaction
  const { isLoading: isConfirming, isSuccess, error: txError } = useWaitForTransactionReceipt({
    hash,
  });

  // Charger les électeurs enregistrés
  useEffect(() => {
    loadRegisteredVoters();
  }, []);

  // Fonction pour décoder les erreurs personnalisées
  const parseContractError = (error) => {
    const errorStr = error.message || '';
    const causeStr = error.cause?.message || '';
    
    // Recherche directe dans les messages
    if (errorStr.includes('AlreadyRegistered') || causeStr.includes('AlreadyRegistered')) {
      return 'Cette adresse est déjà enregistrée comme électeur';
    }
    
    if (errorStr.includes('InvalidWorkflowStatus') || causeStr.includes('InvalidWorkflowStatus')) {
      return 'Impossible d\'ajouter des électeurs dans cette phase';
    }
    
    if (errorStr.includes('OwnableUnauthorizedAccount') || causeStr.includes('OwnableUnauthorizedAccount')) {
      return 'Seul le propriétaire peut ajouter des électeurs';
    }
    
    if (errorStr.includes('EmptyProposal') || causeStr.includes('EmptyProposal')) {
      return 'La proposition ne peut pas être vide';
    }
    
    if (errorStr.includes('NotAVoter') || causeStr.includes('NotAVoter')) {
      return 'Vous n\'êtes pas enregistré comme électeur';
    }
    
    if (errorStr.includes('AlreadyVoted') || causeStr.includes('AlreadyVoted')) {
      return 'Vous avez déjà voté';
    }
    
    if (errorStr.includes('ProposalNotFound') || causeStr.includes('ProposalNotFound')) {
      return 'Proposition introuvable';
    }
    
    if (errorStr.includes('User rejected') || errorStr.includes('user rejected')) {
      return 'Transaction annulée par l\'utilisateur';
    }
    
    // Si c'est un revert mais qu'on ne reconnaît pas l'erreur spécifique
    if (error.cause?.name === 'ContractFunctionRevertedError' || errorStr.includes('reverted')) {
      return 'Transaction rejetée par le contrat';
    }
    
    return 'Erreur lors de l\'envoi de la transaction';
  };

  // Gérer les erreurs de writeContract
  useEffect(() => {
    if (writeError) {
      const errorMessage = parseContractError(writeError);
      setError(errorMessage);
    }
  }, [writeError]);

  // Gérer les erreurs de transaction
  useEffect(() => {
    if (txError) {
      console.error('Transaction Error:', txError);
      
      let errorMessage = 'Transaction échouée';
      
      if (txError.message?.includes('AlreadyRegistered')) {
        errorMessage = 'Cette adresse est déjà enregistrée comme électeur';
      } else if (txError.message?.includes('revert')) {
        errorMessage = 'Transaction rejetée par le contrat';
      }
      
      setError(errorMessage);
    }
  }, [txError]);

  // Vider l'input après succès de la transaction
  useEffect(() => {
    if (isSuccess) {
      setError(''); // Nettoyer les erreurs
      
      if (lastAction === 'addVoter') {
        setVoterAddress(''); // Nettoyer l'input
        setSuccess('Électeur enregistré avec succès !');
        loadRegisteredVoters(); // Recharger la liste
        
        // Effacer le message de succès après 3 secondes
        setTimeout(() => setSuccess(''), 3000);
      } else if (lastAction === 'startProposals') {
        setSuccess('Phase de propositions démarrée ! Redirection...');
        
        // Recharger le workflow status puis rediriger
        refetchWorkflow().then(() => {
          setTimeout(() => {
            window.location.reload();
          }, 500);
        });
      } else {
        // Fallback pour les cas où lastAction n'est pas défini
        // Probablement un addVoter
        setVoterAddress('');
        setSuccess('Électeur enregistré avec succès !');
        loadRegisteredVoters();
        setTimeout(() => setSuccess(''), 3000);
      }
      
      // Reset de l'action
      setLastAction('');
    }
  }, [isSuccess, lastAction, refetchWorkflow]);

  const loadRegisteredVoters = async () => {
    try {
      const logs = await publicClient.getLogs({
        address: contractAddress,
        event: parseAbiItem('event VoterRegistered(address voterAddress)'),
        fromBlock: 0n,
        toBlock: 'latest'
      });
      
      const voters = logs.map(log => log.args.voterAddress);
      setRegisteredVoters(voters);
    } catch (error) {
      console.error('Erreur lors du chargement des électeurs:', error);
    }
  };

  // Fonction pour raccourcir les adresses
  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  };

  const addVoter = async () => {
    if (!voterAddress) return;
    
    // Nettoyer les messages précédents
    setError('');
    setSuccess('');
    
    // Méthode alternative: Simuler d'abord la transaction pour attraper les erreurs
    try {
      console.log('Simulation de la transaction...');
      await publicClient.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'addVoter',
        args: [voterAddress],
        account: address,
      });
      
      console.log('Simulation réussie, envoi de la vraie transaction...');
    } catch (simulationError) {
      const errorMessage = parseContractError(simulationError);
      setError(errorMessage);
      return; // Arrêter ici si la simulation échoue
    }
    
    // Si la simulation passe, envoyer la vraie transaction
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'addVoter',
      args: [voterAddress],
    });
  };

  const startProposalsRegistration = async () => {
    // Nettoyer les messages précédents
    setError('');
    setSuccess('');
    setLastAction('startProposals'); // Marquer l'action
    
    // Simulation préalable
    try {
      await publicClient.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'startProposalsRegistering',
        account: address,
      });
    } catch (simulationError) {
      const errorMessage = parseContractError(simulationError);
      setError(errorMessage);
      return;
    }
    
    // Si la simulation passe, envoyer la vraie transaction
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startProposalsRegistering',
    });
  };

  const isOwner = address === owner;
  const canAddVoters = workflowStatus === 0;
  const hasVoters = registeredVoters.length > 0;

  // Ne pas afficher le composant si on n'est pas dans la bonne phase et qu'on n'est pas owner
  if (workflowStatus !== 0 && !isOwner) {
    return null;
  }

  if (!isOwner && workflowStatus === 0) {
    return (
      <div className="p-4 border rounded">
        <p>Seul le propriétaire peut enregistrer des électeurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded">
      <h2 className="text-xl font-bold">Enregistrement des Électeurs</h2>
      
      <div>
        <p>Statut: {canAddVoters ? 'Ouvert' : 'Fermé'}</p>
      </div>

      {canAddVoters && (
        <div className="space-y-2">
          <Input
            type="text"
            placeholder="Adresse de l'électeur (0x...)"
            value={voterAddress}
            onChange={(e) => setVoterAddress(e.target.value)}
          />
          
          <Button 
            onClick={addVoter}
            disabled={isPending || isConfirming || !voterAddress}
          >
            {isPending ? 'Envoi...' : isConfirming ? 'Confirmation...' : 'Ajouter Électeur'}
          </Button>

          {/* Messages d'erreur et de succès */}
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
        </div>
      )}

      {/* Bouton pour passer à la phase suivante */}
      {isOwner && canAddVoters && (
        <div className="pt-4 border-t">
          <Button 
            onClick={startProposalsRegistration}
            disabled={isPending || isConfirming || !hasVoters}
            className="w-full"
            variant={hasVoters ? "default" : "secondary"}
          >
            {!hasVoters 
              ? `Ajoutez au moins 1 électeur pour continuer` 
              : isPending 
                ? 'Envoi...' 
                : isConfirming 
                  ? 'Confirmation...' 
                  : 'Démarrer l\'enregistrement des propositions'
            }
          </Button>
          {hasVoters && (
            <p className="text-sm text-gray-600 mt-2 text-center">
              Cela fermera l'enregistrement des électeurs définitivement
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="font-semibold">Électeurs Enregistrés ({registeredVoters.length})</h3>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {registeredVoters.map((voter, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-100 rounded">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-mono text-sm text-gray-700">{shortenAddress(voter)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 text-green-500">✓</div>
                <span className="text-xs text-gray-500">Enregistré</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VoterRegistration;