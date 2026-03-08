import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url'; // Added for ESM __dirname equivalent
import { analyzeReviews, classifyIntent } from './core/agent.js';

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

const Header = () => {
    const headerLines = HEADER_ASCII.split('\n');
    return (
        <Box flexDirection="column" alignItems="flex-start" paddingBottom={1}>
            <Box flexDirection="column">
                <Text bold color="#023e7d">{headerLines[0]}</Text>
                <Text bold color="#023e7d">{headerLines[1]}</Text>
                <Text bold color="#0353a4">{headerLines[2]}</Text>
                <Text bold color="#0353a4">{headerLines[3]}</Text>
                <Text bold color="#0466c8">{headerLines[4]}</Text>
                <Text bold color="#0466c8">{headerLines[5]}</Text>
            </Box>
            
            <Box marginTop={1} width={80} justifyContent="flex-start">
                <Text color="gray" dimColor italic wrap="wrap">
                   An AI platform that analyzes real customer complaints to reveal unmet service demand
                </Text>
            </Box>
        </Box>
    );
};

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



const ToolCallDisplay: React.FC<{toolCall: {name: string; query: string}; status: string[]}> = ({ toolCall, status }) => (
	<Box flexDirection="column" paddingBottom={1}>
		<Text color="blue">{toolCall.name} ("{toolCall.query}")</Text>
		{status.map((s, i) => (
			<Box marginLeft={2} key={i}>
				<Text color="gray">└ {s}</Text>
			</Box>
		))}
	</Box>
);

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
	const [startTime, setStartTime] = useState<number | null>(null);
	const [activeToolCall, setActiveToolCall] = useState<{name: string; query: string} | null>(null);
	const [toolCallStatus, setToolCallStatus] = useState<string[]>([]);

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

	const handleCommand = async (command: string) => {
		setIsProcessing(true);
		setToolCallStatus([]);
		setActiveToolCall(null);
		setHistory(prev => [...prev, `> ${command}`]);

		const { intent, searchQuery, detail } = await classifyIntent(command);

		if (intent === 'extract_reviews' && searchQuery) {
			const toolStartTime = Date.now();
			setActiveToolCall({ name: "Google Reviews Extraction", query: searchQuery });
			setToolCallStatus(prev => [...prev, "Initiated."]);

			const pythonScriptPath = path.join(__dirname, '..', 'core', 'utils.py');
			const pythonArgs = [pythonScriptPath, searchQuery];
			const pythonProcess = spawn('python3', pythonArgs);

			let stdoutData = '';
			let stderrData = '';

			pythonProcess.stdout.on('data', (data) => {
				stdoutData += data.toString();
			});

			pythonProcess.stderr.on('data', (data) => {
				stderrData += data.toString();
			});

			pythonProcess.on('close', async (code) => {
				const toolEndTime = Date.now();
				const timeTakenSeconds = ((toolEndTime - toolStartTime) / 1000);
				const minutes = Math.floor(timeTakenSeconds / 60);
				const seconds = Math.round(timeTakenSeconds % 60);
				const timeTakenString = minutes > 0 ? `${minutes} min ${seconds} sec` : `${seconds} sec`;

				if (code === 0) {
					try {
						const reviews = JSON.parse(stdoutData);
						const numReviews = reviews.length;
						setToolCallStatus(prev => [...prev, `Collected ${numReviews} reviews. Processing...`]);
						
						const analysis = await analyzeReviews(reviews);
						setHistory(prev => [...prev, `Tanner AI:\n${analysis}`]);
						setToolCallStatus(prev => [...prev, `Completed in ${timeTakenString}.`]);

					} catch (e) {
						setHistory(prev => [...prev, `Tanner AI: Error parsing reviews. Raw output: ${stdoutData}`]);
						setToolCallStatus(prev => [...prev, `Failed in ${timeTakenString}.`]);
					}
				} else {
					setHistory(prev => [...prev, `Tanner AI: Error during review extraction (exit code ${code}).\n${stderrData}`]);
					setToolCallStatus(prev => [...prev, `Failed in ${timeTakenString}.`]);
				}
				setIsProcessing(false);
			});
		} else if (intent === 'error') {
			setHistory(prev => [...prev, `Tanner AI: Error: ${detail}`]);
			setIsProcessing(false);
		}
		else {
			setHistory(prev => [...prev, `Tanner AI: ${command}`]);
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
			{activeToolCall && <ToolCallDisplay toolCall={activeToolCall} status={toolCallStatus} />}
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