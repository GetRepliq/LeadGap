import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url'; // Added for ESM __dirname equivalent
import { analyzeReviews } from './core/agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEADER_ASCII = `
████████╗ █████╗ ███╗   ██╗███╗   ██╗███████╗██████╗ 
╚══██╔══╝██╔══██╗████╗  ██║████╗  ██║██╔════╝██╔══██╗
   ██║   ███████║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝
   ██║   ██╔══██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗
   ██║   ██║  ██║██║ ╚████║██║ ╚████║███████╗██║  ██║
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝
`.trim();

const Header = () => (
    <Box flexDirection="column" alignItems="flex-start" paddingBottom={1}>
        <Gradient name="morning">
            <Text bold>
                {HEADER_ASCII}
            </Text>
        </Gradient>
        
        <Box marginTop={1} width={80} justifyContent="flex-start">
            <Text color="gray" dimColor italic wrap="wrap">
               An AI platform that analyzes real customer complaints to reveal unmet service demand
            </Text>
        </Box>
    </Box>
);

interface ChatHistoryProps {
	history: string[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ history }) => (
	<Box flexDirection="column" paddingBottom={1}>
		{history.map((message, index) => (
			<Text key={index}>{message}</Text>
		))}
	</Box>
);

interface InputBoxProps {
	value: string;
}

const InputBox: React.FC<InputBoxProps> = ({ value }) => {
	const parts = value.split(/(@\S+)/);
	return (
		<Box borderStyle="single" paddingX={1}>
			<Text>
				{parts.map((part, i) => {
					if (part.startsWith('@')) {
						return (
							<Text key={i} color="red">
								{part}
							</Text>
						);
					}
					return part;
				})}
				█
			</Text>
		</Box>
	);
};

interface FileSuggestionsProps {
	suggestions: string[];
	activeIndex: number;
}

const FileSuggestions: React.FC<FileSuggestionsProps> = ({ suggestions, activeIndex }) => {
	if (suggestions.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column" borderStyle="single" width={80}>
			{suggestions.map((suggestion, index) => {
				const color = index === activeIndex ? 'red' : 'white';
				return (
					<Text key={suggestion} color={color}>
						{suggestion}
					</Text>
				);
			})}
		</Box>
	);
};

const Processing = () => (
	<Box>
		<Text>
			<Spinner /> Processing...
		</Text>
	</Box>
);

const App = () => {
	const { exit } = useApp();
	const [history, setHistory] = useState<string[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [suggestionBoxVisible, setSuggestionBoxVisible] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		if (suggestionBoxVisible) {
			fs.readdir(process.cwd(), (err, files) => {
				if (err) {
					// handle error
				} else {
					setSuggestions(files);
				}
			});
		}
	}, [suggestionBoxVisible]);

	const handleCommand = (command: string) => {
		setIsProcessing(true);
		const extractorRegex = /^extract reviews? for /i; // Matches "review" or "reviews", case-insensitive

		if (extractorRegex.test(command)) {
			const fullCommand = command; // Keep original for display
			let searchQuery = fullCommand.replace(extractorRegex, '').trim();
			
			let minStars: number | undefined;
			let maxStars: number | undefined;

			// Regex to find --min-stars and --max-stars
			const minStarsMatch = fullCommand.match(/--min-stars (\d+)/);
			if (minStarsMatch) {
				minStars = parseInt(minStarsMatch[1], 10);
				searchQuery = searchQuery.replace(minStarsMatch[0], '').trim(); // Remove from search query
			}

			const maxStarsMatch = fullCommand.match(/--max-stars (\d+)/);
			if (maxStarsMatch) {
				maxStars = parseInt(maxStarsMatch[1], 10);
				searchQuery = searchQuery.replace(maxStarsMatch[0], '').trim(); // Remove from search query
			}

			// Clean up extra spaces in search query after removing args
			searchQuery = searchQuery.replace(/\s\s+/g, ' ').trim();

			setHistory(prev => [...prev, `> ${fullCommand}`, `Tanner AI: Starting review extraction for "${searchQuery}"...`]);
			
			const pythonScriptPath = path.join(__dirname, '..', 'core', 'utils.py'); // Adjusted path
			const pythonArgs: string[] = [pythonScriptPath, searchQuery];

			if (minStars !== undefined) {
				pythonArgs.push('--min_stars', minStars.toString());
			}
			if (maxStars !== undefined) {
				pythonArgs.push('--max_stars', maxStars.toString());
			}

			const pythonProcess = spawn('python3', pythonArgs);

			let stdoutData = '';
			let stderrData = '';

			pythonProcess.stdout.on('data', (data) => {
				stdoutData += data.toString();
			});

			pythonProcess.stderr.on('data', (data) => {
				const message = data.toString();
				// Suppress Python script's stderr output from chat for a cleaner summary response
				// setHistory(prev => [...prev, `Tanner AI: ${message}`]); 
				stderrData += message;
			});

			pythonProcess.on('close', async (code) => {
				if (code === 0) {
					try {
						const reviews = JSON.parse(stdoutData);
						setHistory(prev => [...prev, `Tanner AI: Found ${reviews.length} reviews. Now analyzing...`]);
						
						const analysis = await analyzeReviews(reviews);
						setHistory(prev => [...prev, `Tanner AI:\n${analysis}`]);

					} catch (e) {
						setHistory(prev => [...prev, `Tanner AI: Error parsing reviews. Raw output: ${stdoutData}`]);
					}
				} else {
					setHistory(prev => [...prev, `Tanner AI: Error during review extraction (exit code ${code}).\n${stderrData}`]);
				}
				setIsProcessing(false);
			});

		} else {
			setHistory((prevHistory) => [
				...prevHistory,
				`> ${command}`,
				`Tanner AI: ${command}`
			]);
			setIsProcessing(false);
		}
	};

	useInput((input, key) => {
		if (key.ctrl && input.toLowerCase() === 'c') {
			exit();
		}

		if (suggestionBoxVisible) {
			if (key.upArrow) {
				setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
			} else if (key.downArrow) {
				setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				setInputValue(inputValue.slice(0, -1) + suggestions[activeIndex] + ' ');
				setSuggestionBoxVisible(false);
			} else if (key.backspace || key.delete) {
				setInputValue(inputValue.slice(0, -1));
				if(inputValue.slice(0, -1).endsWith('@') === false) {
					setSuggestionBoxVisible(false);
				}

			} else {
				setInputValue(inputValue + input);
			}
		} else {
			if (key.return) {
				handleCommand(inputValue);
				setInputValue('');
			} else if (key.backspace || key.delete) {
				setInputValue(inputValue.slice(0, -1));
			} else {
				if ((inputValue + input).endsWith('@')) {
					setSuggestionBoxVisible(true);
				}
				setInputValue(inputValue + input);
			}
		}
	});

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Header />
			<ChatHistory history={history} />
			<Box flexGrow={1} />
			{isProcessing && <Processing />}
			<InputBox
				value={inputValue}
			/>
			{suggestionBoxVisible && (
				<FileSuggestions suggestions={suggestions} activeIndex={activeIndex} />
			)}
		</Box>
	);
};

render(<App />);