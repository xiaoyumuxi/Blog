import { projects as fallbackProjects } from '../data/projects';

const tones = ['blue', 'violet', 'indigo', 'purple'] as const;

type ProjectTone = (typeof tones)[number];

export interface Project {
  name: string;
  description: string;
  tech: readonly string[];
  href: string;
  label: string;
  tone: ProjectTone;
}

interface GitHubRepository {
  name: string;
  description: string | null;
  url: string;
  primaryLanguage: {
    name: string;
  } | null;
  repositoryTopics: {
    nodes: Array<{
      topic: {
        name: string;
      };
    }>;
  };
}

interface PinnedRepositoriesResponse {
  data?: {
    user?: {
      pinnedItems?: {
        nodes?: GitHubRepository[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const query = `
  query PinnedRepositories($login: String!) {
    user(login: $login) {
      pinnedItems(first: 4, types: [REPOSITORY]) {
        nodes {
          ... on Repository {
            name
            description
            url
            primaryLanguage {
              name
            }
            repositoryTopics(first: 3) {
              nodes {
                topic {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getPinnedProjects(): Promise<readonly Project[]> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  if (!token) {
    return fallbackProjects;
  }

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'xiaoyumuxi-blog',
      },
      body: JSON.stringify({
        query,
        variables: { login: 'xiaoyumuxi' },
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const result = (await response.json()) as PinnedRepositoriesResponse;

    if (result.errors?.length) {
      throw new Error(result.errors.map(error => error.message).join('; '));
    }

    const repos = result.data?.user?.pinnedItems?.nodes ?? [];

    if (!repos.length) {
      return fallbackProjects;
    }

    return repos.slice(0, 4).map((repo, index) => {
      const topics = repo.repositoryTopics.nodes.map(item => item.topic.name);
      const tech = [repo.primaryLanguage?.name, ...topics]
        .filter((item): item is string => Boolean(item))
        .filter((item, itemIndex, list) => list.indexOf(item) === itemIndex)
        .slice(0, 3);

      return {
        name: repo.name,
        description: repo.description ?? 'GitHub 项目',
        tech,
        href: repo.url,
        label: repo.primaryLanguage?.name ?? 'GitHub',
        tone: tones[index % tones.length],
      };
    });
  } catch (error) {
    console.warn('Failed to load GitHub pinned repositories:', error);
    return fallbackProjects;
  }
}
