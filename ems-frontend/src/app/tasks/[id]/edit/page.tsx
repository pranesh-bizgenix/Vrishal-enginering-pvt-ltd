import { TaskEditor } from '../../TaskEditor';

type EditTaskPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditTaskPage({ params }: EditTaskPageProps) {
  const { id } = await params;
  return <TaskEditor mode="edit" taskId={id} />;
}
