pipeline {
    agent any

    environment {
        IMAGE_BACKEND     = "businessos-backend"
        IMAGE_FRONTEND    = "businessos-frontend"
        CONTAINER_BACKEND = "businessos-backend-app"
        CONTAINER_FRONTEND= "businessos-frontend-app"
        APP_PORT_WEB      = "3000"
        APP_PORT_API      = "5000"

        DB_HOST      = "5.223.64.206"
        DB_PORT      = "5432"
        DB_NAME      = "businessos_db"
        DB_USER      = "admin"
        DB_PASSWORD  = "ScaleLite2026XkP9mNqR"

        JWT_SECRET         = "88b7395c79481fe1a8c846c8d4edcc73719dab7c954c18b1e28530371b2270ca"
        JWT_REFRESH_SECRET = "3487b92ba2bc3f2d3220835036695e7a067f76d932ff7dca2594e78738c562ee"
        ENCRYPTION_KEY     = "3d06caa34bc237ab79ef62ea9372623b"

        NEXT_PUBLIC_API_URL    = "http://localhost:5000"
        NEXT_PUBLIC_APP_URL    = "http://localhost:3000"
        NEXT_PUBLIC_SOCKET_URL = "http://localhost:5000"
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: 'master',
                    url: 'https://github.com/DeepakVijayasarathi/businessos.git'
            }
        }

        stage('Build Backend Image') {
            steps {
                sh 'docker build -t $IMAGE_BACKEND:$BUILD_NUMBER -t $IMAGE_BACKEND:latest ./backend'
            }
        }

        stage('Build Frontend Image') {
            steps {
                sh '''
                    docker build \
                        --build-arg NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
                        --build-arg NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
                        -t $IMAGE_FRONTEND:$BUILD_NUMBER -t $IMAGE_FRONTEND:latest \
                        ./frontend
                '''
            }
        }

        stage('Stop Old Containers') {
            steps {
                sh '''
                    docker stop $CONTAINER_BACKEND $CONTAINER_FRONTEND || true
                    docker rm   $CONTAINER_BACKEND $CONTAINER_FRONTEND || true
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker volume create businessos-uploads || true
                    docker volume create businessos-logs || true

                    docker run -d \
                        --name $CONTAINER_BACKEND \
                        --restart unless-stopped \
                        -e NODE_ENV=production \
                        -e PORT=5000 \
                        -e APP_URL=$NEXT_PUBLIC_APP_URL \
                        -e DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" \
                        -e JWT_SECRET=$JWT_SECRET \
                        -e JWT_EXPIRES_IN=15m \
                        -e JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET \
                        -e ENCRYPTION_KEY=$ENCRYPTION_KEY \
                        -p $APP_PORT_API:5000 \
                        -v businessos-uploads:/app/uploads \
                        -v businessos-logs:/app/logs \
                        --health-cmd 'wget -qO- http://localhost:5000/health || exit 1' \
                        --health-interval 30s \
                        --health-timeout 10s \
                        --health-retries 3 \
                        $IMAGE_BACKEND:$BUILD_NUMBER

                    echo "Waiting for backend to become healthy..."
                    for i in $(seq 1 20); do
                        STATUS=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_BACKEND 2>/dev/null)
                        if [ "$STATUS" = "healthy" ]; then break; fi
                        echo "  attempt $i: $STATUS"
                        sleep 5
                    done

                    docker run -d \
                        --name $CONTAINER_FRONTEND \
                        --restart unless-stopped \
                        --link $CONTAINER_BACKEND:backend \
                        -e NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
                        -e NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
                        -e NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
                        -p $APP_PORT_WEB:3000 \
                        $IMAGE_FRONTEND:$BUILD_NUMBER
                '''
            }
        }

        stage('Prune Old Images') {
            steps {
                sh '''
                    docker images $IMAGE_BACKEND --format '{{.Tag}}' | \
                        grep -v latest | grep -v $BUILD_NUMBER | \
                        xargs -r -I{} docker rmi $IMAGE_BACKEND:{} || true

                    docker images $IMAGE_FRONTEND --format '{{.Tag}}' | \
                        grep -v latest | grep -v $BUILD_NUMBER | \
                        xargs -r -I{} docker rmi $IMAGE_FRONTEND:{} || true
                '''
            }
        }
    }

    post {
        success {
            echo "Deployment successful — build #${BUILD_NUMBER}"
            echo "App running at http://localhost:3000"
        }
        failure {
            echo "Build #${BUILD_NUMBER} failed — rolling back to previous containers"
            sh '''
                docker stop "$CONTAINER_BACKEND" "$CONTAINER_FRONTEND" 2>/dev/null || true
                docker rm   "$CONTAINER_BACKEND" "$CONTAINER_FRONTEND" 2>/dev/null || true

                PREV=$(expr "$BUILD_NUMBER" - 1)

                if [ "$PREV" -gt 0 ]; then
                    docker run -d \
                        --name "$CONTAINER_BACKEND" \
                        --restart unless-stopped \
                        -e DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" \
                        -e JWT_SECRET="$JWT_SECRET" \
                        -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
                        -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
                        -p "$APP_PORT_API":5000 \
                        -v businessos-uploads:/app/uploads \
                        "$IMAGE_BACKEND":"$PREV" 2>/dev/null || echo "No previous backend image to roll back to"

                    docker run -d \
                        --name "$CONTAINER_FRONTEND" \
                        --restart unless-stopped \
                        --link "$CONTAINER_BACKEND":backend \
                        -p "$APP_PORT_WEB":3000 \
                        "$IMAGE_FRONTEND":"$PREV" 2>/dev/null || echo "No previous frontend image to roll back to"
                else
                    echo "Build #1 failed — no previous image to roll back to"
                fi
            '''
        }
        always {
            sh "docker system prune -f --filter 'until=24h' || true"
        }
    }
}
