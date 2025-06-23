'use client'

import { Button } from "@/components/ui/button";
import { contractAddress, contractAbi } from '@/constants';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

const VotingEnded = () => {
  const { address } = useAccount();
  
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

  const tallyVotes = async () => {
    try {
      await writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'tallyVotes',
      });
    } catch (error) {
      console.error('Erreur décompte votes:', error);
    }
  };

  const isOwner = address === owner;

  return (
    <div className="p-6 border rounded-lg bg-blue-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-blue-900 mb-2">⏳ Vote Terminé</h2>
        <p className="text-blue-700 mb-4">
          La session de vote est fermée. Il faut maintenant décompter les résultats.
        </p>
      </div>

      {!isOwner ? (
        <div className="text-center">
          <p className="text-blue-600">
            En attente du décompte des votes par le propriétaire...
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Propriétaire: <code>{owner}</code>
          </p>
        </div>
      ) : (
        <div className="text-center">
          <Button 
            onClick={tallyVotes}
            disabled={isPending || isConfirming}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2"
          >
            {isPending ? 'Envoi...' : isConfirming ? 'Décompte en cours...' : '🏆 Décompter les votes'}
          </Button>
          <p className="text-sm text-gray-600 mt-2">
            Cliquez pour finaliser le vote et révéler les résultats
          </p>
          {isConfirming && (
            <p className="text-xs text-green-600 mt-2">
              ⏳ Transaction en cours... Les résultats vont s'afficher
            </p>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 text-center mt-4">
        Contrat: <code>{contractAddress}</code>
      </div>
    </div>
  );
};

export default VotingEnded;