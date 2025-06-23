const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Voting Contract", function () {
    let voting;
    let owner;
    let voter1;
    let voter2;
    let voter3;
    let nonVoter;

    // Enum des status du workflow
    const WorkflowStatus = {
        RegisteringVoters: 0,
        ProposalsRegistrationStarted: 1,
        ProposalsRegistrationEnded: 2,
        VotingSessionStarted: 3,
        VotingSessionEnded: 4,
        VotesTallied: 5
    };

    beforeEach(async function () {
        // Déployer le contrat avant chaque test
        [owner, voter1, voter2, voter3, nonVoter] = await ethers.getSigners();
        
        const VotingContract = await ethers.getContractFactory("Voting");
        voting = await VotingContract.deploy();
        await voting.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct owner", async function () {
            expect(await voting.owner()).to.equal(owner.address);
        });

        it("Should initialize with RegisteringVoters status", async function () {
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.RegisteringVoters);
        });

        it("Should initialize winningProposalID and maxVotes to 0", async function () {
            expect(await voting.winningProposalID()).to.equal(0);
            expect(await voting.maxVotes()).to.equal(0);
        });
    });

    describe("Voter Registration", function () {
        it("Should allow owner to register voters", async function () {
            await expect(voting.addVoter(voter1.address))
                .to.emit(voting, "VoterRegistered")
                .withArgs(voter1.address);
        });

        it("Should revert if non-owner tries to register voters", async function () {
            await expect(voting.connect(voter1).addVoter(voter2.address))
                .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
        });

        it("Should revert if voter is already registered", async function () {
            await voting.addVoter(voter1.address);
            await expect(voting.addVoter(voter1.address))
                .to.be.revertedWithCustomError(voting, "AlreadyRegistered")
                .withArgs(voter1.address);
        });

        it("Should revert if not in RegisteringVoters status", async function () {
            await voting.startProposalsRegistering();
            await expect(voting.addVoter(voter1.address))
                .to.be.revertedWithCustomError(voting, "InvalidWorkflowStatus")
                .withArgs(WorkflowStatus.ProposalsRegistrationStarted, WorkflowStatus.RegisteringVoters);
        });
    });

    describe("Getters", function () {
        beforeEach(async function () {
            await voting.addVoter(voter1.address);
        });

        it("Should return voter information for registered voters", async function () {
            const voterInfo = await voting.connect(voter1).getVoter(voter1.address);
            expect(voterInfo.isRegistered).to.be.true;
            expect(voterInfo.hasVoted).to.be.false;
            expect(voterInfo.votedProposalId).to.equal(0);
        });

        it("Should revert if non-voter tries to get voter info", async function () {
            await expect(voting.connect(nonVoter).getVoter(voter1.address))
                .to.be.revertedWithCustomError(voting, "NotAVoter")
                .withArgs(nonVoter.address);
        });

        it("Should return proposal information for valid proposal ID", async function () {
            await voting.startProposalsRegistering();
            
            const genesisProposal = await voting.connect(voter1).getOneProposal(0);
            expect(genesisProposal.description).to.equal("GENESIS");
            expect(genesisProposal.voteCount).to.equal(0);
        });

        it("Should revert for invalid proposal ID", async function () {
            await voting.startProposalsRegistering();
            
            await expect(voting.connect(voter1).getOneProposal(999))
                .to.be.revertedWithCustomError(voting, "ProposalNotFound")
                .withArgs(999, 0);
        });
    });

    describe("Workflow Status Management", function () {
        it("Should allow owner to start proposals registration", async function () {
            await expect(voting.startProposalsRegistering())
                .to.emit(voting, "WorkflowStatusChange")
                .withArgs(WorkflowStatus.RegisteringVoters, WorkflowStatus.ProposalsRegistrationStarted);
            
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.ProposalsRegistrationStarted);
        });

        it("Should create GENESIS proposal when starting proposals registration", async function () {
            await voting.addVoter(voter1.address);
            await voting.startProposalsRegistering();
            
            const genesisProposal = await voting.connect(voter1).getOneProposal(0);
            expect(genesisProposal.description).to.equal("GENESIS");
        });

        it("Should allow owner to end proposals registration", async function () {
            await voting.startProposalsRegistering();
            
            await expect(voting.endProposalsRegistering())
                .to.emit(voting, "WorkflowStatusChange")
                .withArgs(WorkflowStatus.ProposalsRegistrationStarted, WorkflowStatus.ProposalsRegistrationEnded);
        });

        it("Should allow owner to start voting session", async function () {
            await voting.startProposalsRegistering();
            await voting.endProposalsRegistering();
            
            await expect(voting.startVotingSession())
                .to.emit(voting, "WorkflowStatusChange")
                .withArgs(WorkflowStatus.ProposalsRegistrationEnded, WorkflowStatus.VotingSessionStarted);
        });

        it("Should allow owner to end voting session", async function () {
            await voting.startProposalsRegistering();
            await voting.endProposalsRegistering();
            await voting.startVotingSession();
            
            await expect(voting.endVotingSession())
                .to.emit(voting, "WorkflowStatusChange")
                .withArgs(WorkflowStatus.VotingSessionStarted, WorkflowStatus.VotingSessionEnded);
        });

        it("Should revert workflow changes if wrong status", async function () {
            await expect(voting.endProposalsRegistering())
                .to.be.revertedWithCustomError(voting, "InvalidWorkflowStatus")
                .withArgs(WorkflowStatus.RegisteringVoters, WorkflowStatus.ProposalsRegistrationStarted);
        });

        it("Should revert if non-owner tries to change workflow", async function () {
            await expect(voting.connect(voter1).startProposalsRegistering())
                .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
        });
    });

    describe("Proposal Registration", function () {
        beforeEach(async function () {
            await voting.addVoter(voter1.address);
            await voting.addVoter(voter2.address);
            await voting.startProposalsRegistering();
        });

        it("Should allow registered voters to add proposals", async function () {
            await expect(voting.connect(voter1).addProposal("Proposal 1"))
                .to.emit(voting, "ProposalRegistered")
                .withArgs(1);
        });

        it("Should revert if non-voter tries to add proposal", async function () {
            await expect(voting.connect(nonVoter).addProposal("Proposal 1"))
                .to.be.revertedWithCustomError(voting, "NotAVoter")
                .withArgs(nonVoter.address);
        });

        it("Should revert if proposal is empty", async function () {
            await expect(voting.connect(voter1).addProposal(""))
                .to.be.revertedWithCustomError(voting, "EmptyProposal");
        });

        it("Should revert if not in ProposalsRegistrationStarted status", async function () {
            await voting.endProposalsRegistering();
            
            await expect(voting.connect(voter1).addProposal("Proposal 1"))
                .to.be.revertedWithCustomError(voting, "InvalidWorkflowStatus")
                .withArgs(WorkflowStatus.ProposalsRegistrationEnded, WorkflowStatus.ProposalsRegistrationStarted);
        });

        it("Should increment proposal ID correctly", async function () {
            await voting.connect(voter1).addProposal("Proposal 1");
            await voting.connect(voter2).addProposal("Proposal 2");
            
            const proposal1 = await voting.connect(voter1).getOneProposal(1);
            const proposal2 = await voting.connect(voter1).getOneProposal(2);
            
            expect(proposal1.description).to.equal("Proposal 1");
            expect(proposal2.description).to.equal("Proposal 2");
        });
    });

    describe("Voting", function () {
        beforeEach(async function () {
            // Setup: enregistrer les votants, ajouter des propositions, démarrer le vote
            await voting.addVoter(voter1.address);
            await voting.addVoter(voter2.address);
            await voting.addVoter(voter3.address);
            
            await voting.startProposalsRegistering();
            await voting.connect(voter1).addProposal("Proposal 1");
            await voting.connect(voter2).addProposal("Proposal 2");
            await voting.endProposalsRegistering();
            await voting.startVotingSession();
        });

        it("Should allow registered voters to vote", async function () {
            await expect(voting.connect(voter1).setVote(1))
                .to.emit(voting, "Voted")
                .withArgs(voter1.address, 1);
        });

        it("Should update voter status after voting", async function () {
            await voting.connect(voter1).setVote(1);
            
            const voterInfo = await voting.connect(voter1).getVoter(voter1.address);
            expect(voterInfo.hasVoted).to.be.true;
            expect(voterInfo.votedProposalId).to.equal(1);
        });

        it("Should increment proposal vote count", async function () {
            await voting.connect(voter1).setVote(1);
            
            const proposal = await voting.connect(voter1).getOneProposal(1);
            expect(proposal.voteCount).to.equal(1);
        });

        it("Should update winner when proposal gets more votes", async function () {
            await voting.connect(voter1).setVote(1);
            await voting.connect(voter2).setVote(2);
            await voting.connect(voter3).setVote(1);
            
            expect(await voting.winningProposalID()).to.equal(1);
            expect(await voting.maxVotes()).to.equal(2);
        });

        it("Should revert if voter already voted", async function () {
            await voting.connect(voter1).setVote(1);
            
            await expect(voting.connect(voter1).setVote(2))
                .to.be.revertedWithCustomError(voting, "AlreadyVoted")
                .withArgs(voter1.address);
        });

        it("Should revert if non-voter tries to vote", async function () {
            await expect(voting.connect(nonVoter).setVote(1))
                .to.be.revertedWithCustomError(voting, "NotAVoter")
                .withArgs(nonVoter.address);
        });

        it("Should revert if proposal ID doesn't exist", async function () {
            await expect(voting.connect(voter1).setVote(999))
                .to.be.revertedWithCustomError(voting, "ProposalNotFound")
                .withArgs(999, 2);
        });

        it("Should revert if not in VotingSessionStarted status", async function () {
            await voting.endVotingSession();
            
            await expect(voting.connect(voter1).setVote(1))
                .to.be.revertedWithCustomError(voting, "InvalidWorkflowStatus")
                .withArgs(WorkflowStatus.VotingSessionEnded, WorkflowStatus.VotingSessionStarted);
        });

        it("Should revert if trying to vote when only GENESIS exists", async function () {
            // Créer un nouveau contrat pour ce test spécifique
            const VotingContract = await ethers.getContractFactory("Voting");
            const newVoting = await VotingContract.deploy();
            await newVoting.waitForDeployment();
            
            // Setup minimal : enregistrer votant et aller directement au vote sans ajouter de propositions
            await newVoting.addVoter(voter1.address);
            await newVoting.startProposalsRegistering();
            // Ne pas ajouter de propositions - seulement GENESIS existe (ID 0)
            await newVoting.endProposalsRegistering();
            await newVoting.startVotingSession();
            
            // Essayer de voter pour n'importe quel ID devrait échouer car il faut au moins 2 propositions
            await expect(newVoting.connect(voter1).setVote(0))
                .to.be.revertedWithCustomError(newVoting, "ProposalNotFound")
                .withArgs(0, 0);
        });
    });

    describe("Vote Tallying", function () {
        beforeEach(async function () {
            // Setup complet avec votes
            await voting.addVoter(voter1.address);
            await voting.addVoter(voter2.address);
            await voting.addVoter(voter3.address);
            
            await voting.startProposalsRegistering();
            await voting.connect(voter1).addProposal("Proposal 1");
            await voting.connect(voter2).addProposal("Proposal 2");
            await voting.endProposalsRegistering();
            await voting.startVotingSession();
            
            // Voter (Proposal 1 gagne avec 2 votes)
            await voting.connect(voter1).setVote(1);
            await voting.connect(voter2).setVote(2);
            await voting.connect(voter3).setVote(1);
            
            await voting.endVotingSession();
        });

        it("Should allow owner to tally votes", async function () {
            await expect(voting.tallyVotes())
                .to.emit(voting, "WorkflowStatusChange")
                .withArgs(WorkflowStatus.VotingSessionEnded, WorkflowStatus.VotesTallied);
        });

        it("Should return correct winning proposal ID", async function () {
            const tx = await voting.tallyVotes();
            
            // La fonction retourne une transaction, nous devons vérifier l'état du contrat
            expect(await voting.winningProposalID()).to.equal(1);
        });

        it("Should maintain correct winner after tallying", async function () {
            await voting.tallyVotes();
            
            expect(await voting.winningProposalID()).to.equal(1);
            expect(await voting.maxVotes()).to.equal(2);
        });

        it("Should revert if not in VotingSessionEnded status", async function () {
            // Créer un nouveau contrat pour ce test spécifique
            const VotingContract = await ethers.getContractFactory("Voting");
            const newVoting = await VotingContract.deploy();
            await newVoting.waitForDeployment();
            
            // Setup jusqu'à VotingSessionStarted
            await newVoting.addVoter(voter1.address);
            await newVoting.startProposalsRegistering();
            await newVoting.connect(voter1).addProposal("Test Proposal");
            await newVoting.endProposalsRegistering();
            await newVoting.startVotingSession();
            
            // Maintenant nous sommes en VotingSessionStarted (3), essayer tallyVotes devrait échouer
            await expect(newVoting.tallyVotes())
                .to.be.revertedWithCustomError(newVoting, "InvalidWorkflowStatus")
                .withArgs(WorkflowStatus.VotingSessionStarted, WorkflowStatus.VotingSessionEnded);
        });

        it("Should revert if non-owner tries to tally votes", async function () {
            await expect(voting.connect(voter1).tallyVotes())
                .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
        });
    });

    describe("Edge Cases and Complex Scenarios", function () {
        it("Should handle tie votes correctly (first proposal with max votes wins)", async function () {
            await voting.addVoter(voter1.address);
            await voting.addVoter(voter2.address);
            
            await voting.startProposalsRegistering();
            await voting.connect(voter1).addProposal("Proposal 1");
            await voting.connect(voter2).addProposal("Proposal 2");
            await voting.endProposalsRegistering();
            await voting.startVotingSession();
            
            // Égalité : chaque proposition reçoit 1 vote
            await voting.connect(voter1).setVote(1);
            await voting.connect(voter2).setVote(2);
            
            // Le premier à atteindre le maximum devrait gagner
            expect(await voting.winningProposalID()).to.equal(1);
        });

        it("Should handle single voter scenario", async function () {
            await voting.addVoter(voter1.address);
            
            await voting.startProposalsRegistering();
            await voting.connect(voter1).addProposal("Only Proposal");
            await voting.endProposalsRegistering();
            await voting.startVotingSession();
            
            await voting.connect(voter1).setVote(1);
            
            expect(await voting.winningProposalID()).to.equal(1);
            expect(await voting.maxVotes()).to.equal(1);
        });

        it("Should handle complete workflow cycle", async function () {
            // Test du cycle complet avec un nouveau contrat
            await voting.addVoter(voter1.address);
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.RegisteringVoters);
            
            await voting.startProposalsRegistering();
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.ProposalsRegistrationStarted);
            
            await voting.connect(voter1).addProposal("Test Proposal");
            
            await voting.endProposalsRegistering();
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.ProposalsRegistrationEnded);
            
            await voting.startVotingSession();
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.VotingSessionStarted);
            
            await voting.connect(voter1).setVote(1);
            
            await voting.endVotingSession();
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.VotingSessionEnded);
            
            await voting.tallyVotes();
            expect(await voting.workflowStatus()).to.equal(WorkflowStatus.VotesTallied);
            expect(await voting.winningProposalID()).to.equal(1);
        });
    });
});