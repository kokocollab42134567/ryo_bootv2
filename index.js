const queryAI = async (text) => {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY; // Read from environment variable
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o-mini',
                prompt: `Does this message \"${text}\" contain a request to mention or mention all users in a group? Please first correct any spelling errors or missing character without write it and then respond with only \"yes\" or \"no\". Your reply must be only as I say without change or add anything.print response only in english.`,
                max_tokens: 5,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`, // Use the environment variable
                },
            }
        );

        if (
            response.data &&
            Array.isArray(response.data.choices) &&
            response.data.choices[0]?.text
        ) {
            const aiResponse = response.data.choices[0].text.trim();
            console.log(`AI Pure Response: ${aiResponse}`); // Log the AI response
            return aiResponse.replace(/[^\w\s]/gi, '').toLowerCase() === 'yes';
        } else {
            console.error('Unexpected AI response structure:', response.data);
            return false;
        }
    } catch (error) {
        console.error('Error querying AI:', error.message);
        return false;
    }
};
