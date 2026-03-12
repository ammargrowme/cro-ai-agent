import re

with open('src/App.jsx', 'r') as f:
    text = f.read()

text = text.replace('\\`', '`')
text = text.replace('\\$', '$')
text = text.replace('\\{', '{')
text = text.replace('\\}', '}')
text = text.replace('\\[', '[')
text = text.replace('\\]', ']')
text = text.replace('\\n', '\n')
text = text.replace('\\s', '\\s') # wait \s is regex, let's just make sure it's correct
text = text.replace('\\S', '\\S')
text = text.replace('\\b', '\\b')

with open('src/App.jsx', 'w') as f:
    f.write(text)
