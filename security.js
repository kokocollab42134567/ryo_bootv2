const AUTHORIZED_NUMBERS = ['1234567890@s.whatsapp.net', '0987654321@s.whatsapp.net']; // Add authorized numbers here

const handleGroupUpdate = async (sock, update) => {
    const { id, participants, action, by } = update;
    
    if (action === 'promote' || action === 'demote') {
        for (const participant of participants) {
            if (!AUTHORIZED_NUMBERS.includes(participant)) {
                await sock.groupParticipantsUpdate(id, [participant], action === 'promote' ? 'demote' : 'promote');
                console.log(`Unauthorized admin change detected. Reverted action for ${participant}.`);
            }
        }
    }

    if (action === 'remove') {
        for (const participant of participants) {
            await sock.groupParticipantsUpdate(id, [participant], 'add');
            await sock.groupParticipantsUpdate(id, [by], 'demote');
            console.log(`User ${participant} was removed. Re-added and demoted remover ${by}.`);
        }
    }
};

module.exports = { handleGroupUpdate };
