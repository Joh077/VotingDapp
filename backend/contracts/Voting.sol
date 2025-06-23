// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Decentralized Voting System
/// @author Johan L.
/// @notice This contract allows organizing voting sessions with different workflow phases
/// @dev Implements a voting system with phase management, optimized for gas efficiency
contract Voting is Ownable {

    // ::::::::::::: CUSTOM ERRORS ::::::::::::: //

    /// @notice Error thrown when the caller is not a registered voter
    /// @param caller The address that attempted to access a voter-only function
    error NotAVoter(address caller);
    
    /// @notice Error thrown when a requested proposal does not exist
    /// @param proposalId The requested proposal ID
    /// @param maxId The maximum available ID
    error ProposalNotFound(uint proposalId, uint maxId);
    
    /// @notice Error thrown when an action is attempted in the wrong workflow phase
    /// @param current The current workflow phase
    /// @param required The required phase for this action
    error InvalidWorkflowStatus(uint8 current, uint8 required);
    
    /// @notice Error thrown when attempting to register an already registered voter
    /// @param voter The address of the already registered voter
    error AlreadyRegistered(address voter);
    
    /// @notice Error thrown when a voter attempts to vote multiple times
    /// @param voter The address of the voter who has already voted
    error AlreadyVoted(address voter);
    
    /// @notice Error thrown when an empty proposal is submitted
    error EmptyProposal();

    /// @notice ID of the winning proposal
    /// @dev Automatically updated after each vote
    uint public winningProposalID;
    
    /// @notice Maximum number of votes received by any proposal
    /// @dev Used to determine the winning proposal in real-time
    uint public maxVotes;
    
    /// @notice Structure representing a voter
    /// @dev Contains registration status, voting status, and voted proposal ID
    struct Voter {
        /// @notice Indicates if the voter is registered
        bool isRegistered;
        /// @notice Indicates if the voter has already voted
        bool hasVoted;
        /// @notice ID of the proposal the voter voted for
        uint votedProposalId;
    }

    /// @notice Structure representing a proposal
    /// @dev Contains the description and vote count
    struct Proposal {
        /// @notice Description of the proposal
        string description;
        /// @notice Number of votes received by this proposal
        uint voteCount;
    }

    /// @notice Enumeration of different voting workflow phases
    /// @dev Each phase corresponds to a specific step in the voting process
    enum WorkflowStatus {
        RegisteringVoters,                /// Voter registration phase
        ProposalsRegistrationStarted,     /// Proposal registration phase
        ProposalsRegistrationEnded,       /// End of proposal registration
        VotingSessionStarted,             /// Active voting phase
        VotingSessionEnded,               /// End of voting phase
        VotesTallied                      /// Vote counting completed
    }

    /// @notice Current workflow phase
    /// @dev Controls which actions are allowed at each step
    WorkflowStatus public workflowStatus;
    
    /// @notice Array containing all proposals
    /// @dev The first element is always the "BLANKVOTE AS GENESIS" proposal
    Proposal[] proposalsArray;
    
    /// @notice Mapping associating each address with their voter information
    /// @dev Allows checking eligibility and voting status of each address
    mapping (address => Voter) voters;

    /// @notice Emitted when a new voter is registered
    /// @param voterAddress The address of the registered voter
    event VoterRegistered(address voterAddress); 
    
    /// @notice Emitted when the workflow changes phase
    /// @param previousStatus The previous phase
    /// @param newStatus The new phase
    event WorkflowStatusChange(WorkflowStatus previousStatus, WorkflowStatus newStatus);
    
    /// @notice Emitted when a new proposal is registered
    /// @param proposalId The ID of the registered proposal
    event ProposalRegistered(uint proposalId);
    
    /// @notice Emitted when a vote is cast
    /// @param voter The address of the voter
    /// @param proposalId The ID of the voted proposal
    event Voted (address voter, uint proposalId);

    /// @notice Contract constructor
    /// @dev Initializes the contract with the deployer as owner
    constructor() Ownable(msg.sender) {}
    
    // ::::::::::::: OPTIMIZED MODIFIERS ::::::::::::: //
    
    /// @notice Modifier to restrict access to registered voters only
    /// @dev Checks that msg.sender is a registered voter
    modifier onlyVoters() {
        if (!voters[msg.sender].isRegistered) {
            revert NotAVoter(msg.sender);
        } 
        _;
    }
    
    /// @notice Modifier to verify that the contract is in a specific phase
    /// @dev Uses uint8 to optimize comparisons
    /// @param _requiredStatus The required phase to execute the function
    modifier atStatus(uint8 _requiredStatus) {
        if (uint8(workflowStatus) != _requiredStatus) {
            revert InvalidWorkflowStatus(uint8(workflowStatus), _requiredStatus);
        }
        _;
    }

    // ::::::::::::: GETTERS ::::::::::::: //

    /// @notice Retrieves information about a voter
    /// @dev Only accessible to registered voters
    /// @param _addr The address of the voter to query
    /// @return The voter information (Voter struct)
    function getVoter(address _addr) external onlyVoters view returns (Voter memory) {
        return voters[_addr];
    }
    
    /// @notice Retrieves information about a proposal
    /// @dev Only accessible to registered voters
    /// @param _id The ID of the proposal to query
    /// @return The proposal information (Proposal struct)
    function getOneProposal(uint _id) external onlyVoters view returns (Proposal memory) {
        if (_id >= proposalsArray.length) {
            revert ProposalNotFound(_id, proposalsArray.length - 1);
        }
        return proposalsArray[_id];
    }

    // ::::::::::::: REGISTRATION ::::::::::::: // 

    /// @notice Registers a new voter
    /// @dev Only the owner can register voters, only during RegisteringVoters phase
    /// @param _addr The address of the voter to register
    function addVoter(address _addr) external onlyOwner atStatus(0) {
        if (voters[_addr].isRegistered) {
            revert AlreadyRegistered(_addr);
        }
        voters[_addr].isRegistered = true;
        emit VoterRegistered(_addr);
    }

    // ::::::::::::: PROPOSAL ::::::::::::: // 

    /// @notice Adds a new proposal
    /// @dev Only registered voters can add proposals during ProposalsRegistrationStarted phase
    /// @param _desc The description of the proposal (cannot be empty)
    function addProposal(string calldata _desc) external onlyVoters atStatus(1) {
        if (bytes(_desc).length == 0) {
            revert EmptyProposal();
        }
        
        proposalsArray.push(Proposal(_desc, 0));
        uint256 proposalId = proposalsArray.length - 1;
        emit ProposalRegistered(proposalId);
    }

    // ::::::::::::: VOTE ::::::::::::: //

    /// @notice Allows a voter to vote for a proposal
    /// @dev Only registered voters can vote, only during VotingSessionStarted phase
    /// @dev Automatically updates the winning proposal if necessary
    /// @param _id The ID of the proposal to vote for
    function setVote(uint _id) external onlyVoters atStatus(3) {
        if (_id >= proposalsArray.length) {
            revert ProposalNotFound(_id, proposalsArray.length - 1);
        }

        // Optimization: calculate storage address only once
        Voter storage voter = voters[msg.sender];

        if (voter.hasVoted) {
            revert AlreadyVoted(msg.sender);
        }

        voter.votedProposalId = _id;
        voter.hasVoted = true;
        ++proposalsArray[_id].voteCount;

        _updateWinner(_id);

        emit Voted(msg.sender, _id);
    }

    // ::::::::::::: WINNER CALCULATION ::::::::::::: //
    
    /// @notice Updates the winning proposal if necessary
    /// @dev Private function called after each vote to maintain the winner up-to-date
    /// @param _proposalId The ID of the proposal that just received a vote
    function _updateWinner(uint _proposalId) private {
        uint currentVotes = proposalsArray[_proposalId].voteCount;
        
        // If this proposal has strictly more votes than the current maximum
        if (currentVotes > maxVotes) {
            maxVotes = currentVotes;
            winningProposalID = _proposalId;
        }
    }

    // ::::::::::::: STATE MANAGEMENT ::::::::::::: //
    
    /// @notice Changes the workflow phase and emits an event
    /// @dev Private function used by all phase transition functions
    /// @param _newStatus The new workflow phase
    function _changeWorkflowStatus(WorkflowStatus _newStatus) private {
        WorkflowStatus _previousStatus = workflowStatus;
        workflowStatus = _newStatus;
        emit WorkflowStatusChange(_previousStatus, _newStatus);
    }

    /// @notice Starts the proposal registration phase
    /// @dev Only the owner can start this phase, only from RegisteringVoters
    /// @dev Automatically adds the "BLANK VOTE" proposal at index 0
    function startProposalsRegistering() external onlyOwner atStatus(0) {
        _changeWorkflowStatus(WorkflowStatus.ProposalsRegistrationStarted);
        
        // Add the BLANKVOTE AS GENESIS proposal at index 0
        proposalsArray.push(Proposal("BLANKVOTE", 0));
    }

    /// @notice Ends the proposal registration phase
    /// @dev Only the owner can end this phase, only from ProposalsRegistrationStarted
    function endProposalsRegistering() external onlyOwner atStatus(1) {
        _changeWorkflowStatus(WorkflowStatus.ProposalsRegistrationEnded);
    }

    /// @notice Starts the voting session
    /// @dev Only the owner can start this phase, only from ProposalsRegistrationEnded
    function startVotingSession() external onlyOwner atStatus(2) {
        _changeWorkflowStatus(WorkflowStatus.VotingSessionStarted);
    }

    /// @notice Ends the voting session
    /// @dev Only the owner can end this phase, only from VotingSessionStarted
    function endVotingSession() external onlyOwner atStatus(3) {
        _changeWorkflowStatus(WorkflowStatus.VotingSessionEnded);
    }

    /// @notice Finalizes vote counting and determines the winner
    /// @dev Only the owner can finalize, only from VotingSessionEnded
    /// @dev The winner is already known thanks to the real-time update system
    /// @return The ID of the winning proposal
    function tallyVotes() external onlyOwner atStatus(4) returns (uint) {

        _changeWorkflowStatus(WorkflowStatus.VotesTallied);
        return winningProposalID;
    }
}